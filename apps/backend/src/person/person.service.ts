import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parseHistoricalDate } from "@genealogy/core";
import type {
  CreateNameVariant,
  CreatePerson,
  CreatePersonEvent,
  CreateUnion,
  HistoricalDate,
  Parentage,
  PedigreeNode,
  UpdateNameVariant,
  UpdatePerson,
  UpdatePersonEvent,
  UpdateUnion,
} from "@genealogy/core";
import {
  addParentOf,
  addSpouseOf,
  ancestorsOf,
  citations,
  createDatabase,
  deletePersonNode,
  descendantsOf,
  inGraphTransaction,
  personEvents,
  personNames,
  persons,
  personsWithRelations,
  removeParentOf,
  removeSpouseOf,
  spousesOf,
  unions,
  upsertPersonNode,
  type Database,
  type PersonEventRow,
  type PersonNameRow,
  type PersonRow,
  type UnionRow,
} from "@genealogy/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, count, eq, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";
import { generatePublicId } from "./public-id.js";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Recomputes `earliest`/`latest` from the free-text wording, unconditionally,
 * for every date field a person/event/union can carry. Unconditional rather
 * than "only if both bounds are still null" on purpose: every frontend form
 * that sets a date now recomputes its own bounds client-side too (see
 * PersonFields/EventForm/AddRelative), so server and client should always
 * agree — this exists as an idempotent backstop against a caller sending
 * stale bounds alongside changed text, which is exactly the bug class that
 * motivated this function existing at all. It's cheap (a single regex pass)
 * and safe to run on every write.
 */
function resolveDate(date: HistoricalDate | null | undefined): HistoricalDate | null | undefined {
  if (!date) return date;
  return { ...date, ...parseHistoricalDate(date.original) };
}

/** Postgres SQLSTATE 23505 — a `UNIQUE`/primary-key constraint was violated. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface ListPersonsInput {
  limit: number;
  offset: number;
  search: string | null;
}

export interface ListPersonsResult {
  /** `hasRelations` mirrors the guard in `remove` — lets the list hide the delete action per row without a `relatives()` round trip each. */
  items: (PersonRow & { hasRelations: boolean })[];
  total: number;
}

export interface RelativesResult {
  parents: PersonRow[];
  spouses: PersonRow[];
  children: PersonRow[];
}

@Injectable()
export class PersonService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  async list(input: ListPersonsInput): Promise<ListPersonsResult> {
    const where = this.searchFilter(input.search);

    const items = await this.db
      .select()
      .from(persons)
      .where(where)
      .orderBy(asc(persons.surname), asc(persons.given))
      .limit(input.limit)
      .offset(input.offset);

    const [totals] = await this.db.select({ value: count() }).from(persons).where(where);

    const ids = items.map((item) => item.id);
    const [relatedIds, unionRows] = await Promise.all([
      personsWithRelations(this.pool, ids),
      ids.length > 0
        ? this.db
            .select({ personAId: unions.personAId, personBId: unions.personBId })
            .from(unions)
            .where(or(inArray(unions.personAId, ids), inArray(unions.personBId, ids)))
        : [],
    ]);
    const unionPersonIds = new Set(unionRows.flatMap((row) => [row.personAId, row.personBId]));

    return {
      items: items.map((item) =>
        Object.assign(item, {
          hasRelations: relatedIds.has(item.id) || unionPersonIds.has(item.id),
        }),
      ),
      total: totals?.value ?? 0,
    };
  }

  /**
   * Every distinct, non-blank `titlePrefix`/`suffix` already recorded across
   * all persons, sorted — feeds the autocomplete on those two fields in
   * PersonFields alongside a fixed list of common values, so a title or
   * suffix already used once is easy to reuse verbatim instead of being
   * retyped slightly differently ("Dr." vs "Dr" vs "Doctor").
   */
  async listTitlePrefixes(): Promise<string[]> {
    return this.distinctNonBlank(persons.titlePrefix);
  }

  async listSuffixes(): Promise<string[]> {
    return this.distinctNonBlank(persons.suffix);
  }

  private async distinctNonBlank(column: typeof persons.titlePrefix | typeof persons.suffix) {
    const rows = await this.db
      .selectDistinct({ value: column })
      .from(persons)
      .where(isNotNull(column))
      .orderBy(asc(column));
    return rows
      .map((row) => row.value)
      .filter((value): value is string => value !== null && value.trim() !== "");
  }

  async byId(id: string): Promise<PersonRow> {
    const [row] = await this.db.select().from(persons).where(eq(persons.id, id)).limit(1);
    if (!row) {
      throw new NotFoundException(`No person with id ${id}`);
    }
    return row;
  }

  /**
   * Writes the relational row and its graph node in one transaction. If either
   * half fails the other is rolled back, which is the only thing keeping the
   * two stores from drifting apart.
   *
   * Retries a handful of times on a `publicId` collision (Postgres unique
   * violation, SQLSTATE 23505) — at ~56 billion combinations this should
   * essentially never fire, but the collision is cheap to detect and cheap
   * to retry, so there's no reason not to handle it.
   */
  async create(input: CreatePerson): Promise<PersonRow> {
    const values = { ...input, birth: resolveDate(input.birth), death: resolveDate(input.death) };
    for (let attempt = 1; ; attempt++) {
      try {
        // Each attempt must fully resolve before the next can know whether a
        // retry is even needed — nothing here is parallelizable.
        // eslint-disable-next-line no-await-in-loop
        return await inGraphTransaction(this.pool, async (client) => {
          const tx = createDatabase(client);
          const [row] = await tx
            .insert(persons)
            .values({ ...values, publicId: generatePublicId() })
            .returning();
          if (!row) {
            throw new Error("Insert returned no row");
          }
          await upsertPersonNode(this.pool, row.id, { client });
          return row;
        });
      } catch (error) {
        if (attempt >= 5 || !isUniqueViolation(error)) {
          throw error;
        }
      }
    }
  }

  /** Relational fields only — the graph node is keyed by `id` alone, so nothing there changes. */
  async update(input: UpdatePerson): Promise<PersonRow> {
    const { id, ...patch } = input;
    const values = { ...patch, birth: resolveDate(patch.birth), death: resolveDate(patch.death) };
    const [row] = await this.db
      .update(persons)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No person with id ${id}`);
    }
    return row;
  }

  /**
   * Deletes a person outright — the relational row (cascading to their alternate
   * names, life events, unions and citations) and their graph node together,
   * plus their uploaded photo, if any. Only allowed while they have no
   * recorded relationship to anyone else: parent, spouse, or child, including a
   * union row left behind by `unlinkSpouse` (which deliberately doesn't delete
   * it — see its comment) or a `SPOUSE_OF` edge left behind by `removeUnion`
   * (ditto). Losing a relationship silently because the person on one end of
   * it got deleted would be worse than asking the caller to unlink first.
   */
  async remove(id: string): Promise<void> {
    const person = await this.byId(id);
    const [relatives, unionRows] = await Promise.all([this.relatives(id), this.listUnions(id)]);
    if (
      relatives.parents.length > 0 ||
      relatives.spouses.length > 0 ||
      relatives.children.length > 0 ||
      unionRows.length > 0
    ) {
      throw new BadRequestException(
        "This person still has recorded relationships. Remove those first.",
      );
    }

    await inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      await tx.delete(persons).where(eq(persons.id, id));
      await deletePersonNode(this.pool, id, { client });
    });

    if (person.photoPath) {
      const uploadsDir = this.config.getOrThrow<string>("UPLOADS_DIR");
      await rm(join(uploadsDir, person.photoPath), { force: true });
    }
  }

  /**
   * Writes the file under `UPLOADS_DIR` and points `photoPath` at it,
   * replacing (and deleting) any previous photo. Called from
   * `person-photo.controller.ts`, the one REST endpoint in an otherwise
   * all-tRPC API — multipart file upload doesn't fit tRPC's JSON contract.
   */
  async setPhoto(id: string, file: UploadedPhoto): Promise<PersonRow> {
    const person = await this.byId(id);
    const uploadsDir = this.config.getOrThrow<string>("UPLOADS_DIR");
    await mkdir(uploadsDir, { recursive: true });

    const ext = extname(file.originalname) || MIME_EXTENSIONS[file.mimetype] || "";
    const filename = `${id}-${randomUUID()}${ext}`;
    await writeFile(join(uploadsDir, filename), file.buffer);

    if (person.photoPath) {
      await rm(join(uploadsDir, person.photoPath), { force: true });
    }

    const [row] = await this.db
      .update(persons)
      .set({ photoPath: filename, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No person with id ${id}`);
    }
    return row;
  }

  async removePhoto(id: string): Promise<PersonRow> {
    const person = await this.byId(id);
    if (person.photoPath) {
      const uploadsDir = this.config.getOrThrow<string>("UPLOADS_DIR");
      await rm(join(uploadsDir, person.photoPath), { force: true });
    }

    const [row] = await this.db
      .update(persons)
      .set({ photoPath: null, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No person with id ${id}`);
    }
    return row;
  }

  /** Direct parents, spouses and children, resolved to full rows for display. */
  async relatives(id: string): Promise<RelativesResult> {
    const [parentNodes, spouseNodes, childNodes] = await Promise.all([
      ancestorsOf(this.pool, id, 1),
      spousesOf(this.pool, id),
      descendantsOf(this.pool, id, 1),
    ]);

    const ids = [
      ...new Set([...parentNodes, ...spouseNodes, ...childNodes].map((node) => node.personId)),
    ];
    const rows =
      ids.length > 0 ? await this.db.select().from(persons).where(inArray(persons.id, ids)) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const toRows = (nodes: PedigreeNode[]): PersonRow[] =>
      nodes.flatMap((node) => byId.get(node.personId) ?? []);

    return {
      parents: toRows(parentNodes),
      spouses: toRows(spouseNodes),
      children: toRows(childNodes),
    };
  }

  /** Both people must already exist; the edge is idempotent. */
  async linkParent(parentId: string, childId: string, parentage: Parentage): Promise<void> {
    if (parentId === childId) {
      throw new Error("A person cannot be their own parent");
    }
    await inGraphTransaction(this.pool, async (client) => {
      await addParentOf(this.pool, parentId, childId, parentage, { client });
    });
  }

  async linkSpouse(aId: string, bId: string): Promise<void> {
    if (aId === bId) {
      throw new Error("A person cannot be their own spouse");
    }
    await inGraphTransaction(this.pool, async (client) => {
      await addSpouseOf(this.pool, aId, bId, { client });
    });
  }

  /** A no-op if the two were never linked as parent/child. */
  async unlinkParent(parentId: string, childId: string): Promise<void> {
    await inGraphTransaction(this.pool, async (client) => {
      await removeParentOf(this.pool, parentId, childId, { client });
    });
  }

  /** A no-op if the two were never linked as spouses. */
  async unlinkSpouse(aId: string, bId: string): Promise<void> {
    await inGraphTransaction(this.pool, async (client) => {
      await removeSpouseOf(this.pool, aId, bId, { client });
    });
  }

  async ancestors(id: string, generations: number): Promise<PedigreeNode[]> {
    return ancestorsOf(this.pool, id, generations);
  }

  async descendants(id: string, generations: number): Promise<PedigreeNode[]> {
    return descendantsOf(this.pool, id, generations);
  }

  /** Maiden name, married name(s), spelling variants found in records. */
  async listNames(personId: string): Promise<PersonNameRow[]> {
    return this.db.select().from(personNames).where(eq(personNames.personId, personId));
  }

  async addName(input: CreateNameVariant): Promise<PersonNameRow> {
    const [row] = await this.db.insert(personNames).values(input).returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  async updateName(input: UpdateNameVariant): Promise<PersonNameRow> {
    const { id, ...patch } = input;
    const [row] = await this.db
      .update(personNames)
      .set(patch)
      .where(eq(personNames.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No name variant with id ${id}`);
    }
    return row;
  }

  /**
   * A no-op if the name variant was already removed. Also removes any
   * citations pointing at it — `citations.factId` isn't a real foreign key
   * (see the schema.ts comment), so nothing else would clean these up.
   */
  async removeName(id: string): Promise<void> {
    await this.db.delete(personNames).where(eq(personNames.id, id));
    await this.db
      .delete(citations)
      .where(and(eq(citations.factType, "name"), eq(citations.factId, id)));
  }

  /**
   * Life events beyond birth/death: residence, occupation, immigration, and
   * the like — oldest first, by the resolved bound of `date` (falling back to
   * `latest` for an open-ended range); undated events sort last.
   */
  async listEvents(personId: string): Promise<PersonEventRow[]> {
    return this.db
      .select()
      .from(personEvents)
      .where(eq(personEvents.personId, personId))
      .orderBy(
        sql`coalesce(${personEvents.date}->>'earliest', ${personEvents.date}->>'latest') asc nulls last`,
      );
  }

  async addEvent(input: CreatePersonEvent): Promise<PersonEventRow> {
    const values = { ...input, date: resolveDate(input.date) };
    const [row] = await this.db.insert(personEvents).values(values).returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  async updateEvent(input: UpdatePersonEvent): Promise<PersonEventRow> {
    const { id, ...patch } = input;
    const values = { ...patch, date: resolveDate(patch.date) };
    const [row] = await this.db
      .update(personEvents)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(personEvents.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No event with id ${id}`);
    }
    return row;
  }

  /** A no-op if the event was already removed. Also removes any citations pointing at it. */
  async removeEvent(id: string): Promise<void> {
    await this.db.delete(personEvents).where(eq(personEvents.id, id));
    await this.db
      .delete(citations)
      .where(and(eq(citations.factType, "event"), eq(citations.factId, id)));
  }

  /** Every union involving this person, on either side of the pair. */
  async listUnions(personId: string): Promise<UnionRow[]> {
    return this.db
      .select()
      .from(unions)
      .where(or(eq(unions.personAId, personId), eq(unions.personBId, personId)));
  }

  /**
   * Also links the pair as spouses in the graph, in the same transaction —
   * a union record implies a `SPOUSE_OF` edge, and letting the two halves
   * drift would break the two-store consistency this codebase otherwise
   * guarantees (see `create()` above).
   */
  async addUnion(input: CreateUnion): Promise<UnionRow> {
    const values = {
      ...input,
      startDate: resolveDate(input.startDate),
      endDate: resolveDate(input.endDate),
    };
    return inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      const [row] = await tx.insert(unions).values(values).returning();
      if (!row) {
        throw new Error("Insert returned no row");
      }
      await addSpouseOf(this.pool, input.personAId, input.personBId, { client });
      return row;
    });
  }

  async updateUnion(input: UpdateUnion): Promise<UnionRow> {
    const { id, ...patch } = input;
    const values = {
      ...patch,
      startDate: resolveDate(patch.startDate),
      endDate: resolveDate(patch.endDate),
    };
    const [row] = await this.db
      .update(unions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(unions.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No union with id ${id}`);
    }
    return row;
  }

  /**
   * A no-op if the union was already removed. Deliberately does not unlink
   * the `SPOUSE_OF` graph edge — the pair remaining linked (e.g. after a
   * divorce record is removed) is usually still correct, and any remaining
   * unions between them would otherwise lose their graph edge too. Does
   * remove any citations pointing at this union, same as `removeName`/`removeEvent`.
   */
  async removeUnion(id: string): Promise<void> {
    await this.db.delete(unions).where(eq(unions.id, id));
    await this.db
      .delete(citations)
      .where(and(eq(citations.factType, "union"), eq(citations.factId, id)));
  }

  private searchFilter(search: string | null): SQL | undefined {
    if (!search || search.trim() === "") return undefined;
    const pattern = `%${search.trim()}%`;
    return or(ilike(persons.surname, pattern), ilike(persons.given, pattern));
  }
}
