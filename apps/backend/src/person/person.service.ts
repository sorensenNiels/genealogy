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
  RelationshipToRoot,
  Sex,
  UpdateNameVariant,
  UpdatePerson,
  UpdatePersonEvent,
  UpdateUnion,
} from "@genealogy/core";
import {
  addParentOf,
  addSpouseOf,
  ancestorsOf,
  birthEvents,
  citations,
  configurableOptions,
  createDatabase,
  deathEvents,
  deletePersonNode,
  descendantsOf,
  inGraphTransaction,
  parentsOf,
  parentsOfMany,
  personEvents,
  personNames,
  persons,
  personsWithRelations,
  personsWithVitals,
  removeParentOf,
  removeSpouseOf,
  researchNotes,
  spousesOf,
  treeAround,
  unions,
  upsertPersonNode,
  userProfiles,
  type Database,
  type PersonEventRow,
  type PersonNameRow,
  type PersonWithVitals,
  type TreeEdge,
  type UnionRow,
} from "@genealogy/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
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

/**
 * Postgres SQLSTATE 23505 — a `UNIQUE`/primary-key constraint was violated.
 * Drizzle wraps the raw `pg` error in a `DrizzleQueryError`, which puts the
 * original error (the one that actually carries `.code`) on `.cause` rather
 * than spreading it onto itself — checking `error.code` alone here would
 * silently never match.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  return code === "23505" || cause?.code === "23505";
}

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export type ListPersonsSort = "surname_asc" | "given_asc" | "birth_asc" | "birth_desc";

export interface ListPersonsInput {
  limit: number;
  offset: number;
  search: string | null;
  sex: Sex | null;
  /** Matches either the birth or the death place. */
  place: string | null;
  bornAfter: number | null;
  bornBefore: number | null;
  /** "Has primary source" in the UI — any citation at all, same signal as `calculateResearchCompleteness`'s `hasCitation`. */
  hasCitation: boolean;
  missingBirthRecord: boolean;
  hasOpenResearchNote: boolean;
  /**
   * Restricts to ancestors of whichever person `viewerUserId` has identified
   * as themselves (`userProfiles.personId`) — strictly upward, not the
   * viewer's own record or their descendants. An account with no linked
   * person yields an empty result rather than an error.
   */
  directAncestorsOnly: boolean;
  sort: ListPersonsSort;
  viewerUserId: string;
}

export interface ListPersonsResult {
  items: (PersonWithVitals & {
    /** `hasRelations` mirrors the guard in `remove` — lets the list hide the delete action per row without a `relatives()` round trip each. */
    hasRelations: boolean;
    /** Birth parents only, for the list's "Parents" column — up to however many are recorded. */
    parents: { given: string; surname: string }[];
    citationCount: number;
    /** The single highest-ranked confidence among this person's citations (by `configurableOptions.sortOrder`), null when uncited. */
    topConfidence: string | null;
  })[];
  total: number;
}

export interface RelativesResult {
  parents: (PersonWithVitals & { parentage: Parentage })[];
  spouses: PersonWithVitals[];
  children: PersonWithVitals[];
}

export interface TreeResult {
  rootId: string;
  people: PersonWithVitals[];
  parentEdges: TreeEdge[];
  spouseEdges: Array<[string, string]>;
  /** See `TreeGraph` in `@genealogy/db` for what these mean. */
  parentsKnownIds: string[];
  childrenKnownIds: string[];
}

@Injectable()
export class PersonService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  async list(input: ListPersonsInput): Promise<ListPersonsResult> {
    const ancestorIds = input.directAncestorsOnly
      ? await this.ancestorIdsFor(input.viewerUserId)
      : null;
    if (ancestorIds !== null && ancestorIds.size === 0) {
      return { items: [], total: 0 };
    }

    const where = this.listFilter(input, ancestorIds);

    const items = await personsWithVitals(this.db)
      .where(where)
      .orderBy(...this.sortColumns(input.sort))
      .limit(input.limit)
      .offset(input.offset);

    const [totals] = await this.db
      .select({ value: count() })
      .from(persons)
      .leftJoin(
        birthEvents,
        and(eq(birthEvents.personId, persons.id), eq(birthEvents.eventType, "birth")),
      )
      .leftJoin(
        deathEvents,
        and(eq(deathEvents.personId, persons.id), eq(deathEvents.eventType, "death")),
      )
      .where(where);

    const ids = items.map((item) => item.id);
    const [relatedIds, unionRows, parentsByChild, citationRollup] = await Promise.all([
      personsWithRelations(this.pool, ids),
      ids.length > 0
        ? this.db
            .select({ personAId: unions.personAId, personBId: unions.personBId })
            .from(unions)
            .where(or(inArray(unions.personAId, ids), inArray(unions.personBId, ids)))
        : [],
      parentsOfMany(this.pool, ids),
      this.citationRollup(ids),
    ]);
    const unionPersonIds = new Set(unionRows.flatMap((row) => [row.personAId, row.personBId]));

    const allParentIds = [
      ...new Set([...parentsByChild.values()].flat().map((edge) => edge.personId)),
    ];
    const parentPersonRows =
      allParentIds.length > 0
        ? await this.db
            .select({ id: persons.id, given: persons.given, surname: persons.surname })
            .from(persons)
            .where(inArray(persons.id, allParentIds))
        : [];
    const parentPersonById = new Map(parentPersonRows.map((row) => [row.id, row]));

    return {
      items: items.map((item) => {
        const parentEdges = parentsByChild.get(item.id) ?? [];
        const parents = parentEdges
          .filter((edge) => edge.parentage === "birth")
          .flatMap((edge) => {
            const row = parentPersonById.get(edge.personId);
            return row ? [{ given: row.given, surname: row.surname }] : [];
          });
        const rollup = citationRollup.get(item.id);
        return Object.assign(item, {
          hasRelations: relatedIds.has(item.id) || unionPersonIds.has(item.id),
          parents,
          citationCount: rollup?.count ?? 0,
          topConfidence: rollup?.topConfidence ?? null,
        });
      }),
      total: totals?.value ?? 0,
    };
  }

  /** Ids of every ancestor of whoever `viewerUserId` has identified as themselves; empty if they haven't. */
  private async ancestorIdsFor(viewerUserId: string): Promise<Set<string>> {
    const [profile] = await this.db
      .select({ personId: userProfiles.personId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, viewerUserId))
      .limit(1);
    const rootId = profile?.personId;
    if (!rootId) return new Set();
    const ancestors = await ancestorsOf(this.pool, rootId);
    return new Set(ancestors.map((node) => node.personId));
  }

  private listFilter(input: ListPersonsInput, ancestorIds: Set<string> | null): SQL | undefined {
    const clauses: SQL[] = [];

    if (input.search && input.search.trim() !== "") {
      // `ilike` is already case-insensitive (confirmed against this db's
      // en_US.UTF-8 collation, including Danish letters like ø/å/æ) — no
      // extra lowercasing needed here.
      const pattern = `%${input.search.trim()}%`;
      clauses.push(or(ilike(persons.surname, pattern), ilike(persons.given, pattern))!);
    }
    if (input.sex) {
      clauses.push(eq(persons.sex, input.sex));
    }
    if (input.place && input.place.trim() !== "") {
      const pattern = `%${input.place.trim()}%`;
      clauses.push(or(ilike(birthEvents.place, pattern), ilike(deathEvents.place, pattern))!);
    }
    if (input.bornAfter != null) {
      clauses.push(sql`(${birthEvents.date}->>'earliest') >= ${`${input.bornAfter}-01-01`}`);
    }
    if (input.bornBefore != null) {
      clauses.push(sql`(${birthEvents.date}->>'earliest') <= ${`${input.bornBefore}-12-31`}`);
    }
    if (input.missingBirthRecord) {
      clauses.push(isNull(birthEvents.date));
    }
    if (input.hasCitation) {
      clauses.push(
        sql`exists (select 1 from ${citations} where ${citations.personId} = ${persons.id})`,
      );
    }
    if (input.hasOpenResearchNote) {
      clauses.push(
        sql`exists (select 1 from ${researchNotes} where ${researchNotes.personId} = ${persons.id} and ${researchNotes.resolved} = false)`,
      );
    }
    if (ancestorIds !== null) {
      clauses.push(inArray(persons.id, [...ancestorIds]));
    }

    return clauses.length > 0 ? and(...clauses) : undefined;
  }

  private sortColumns(sort: ListPersonsSort) {
    switch (sort) {
      case "given_asc":
        return [asc(persons.given), asc(persons.surname)];
      case "birth_asc":
        return [sql`(${birthEvents.date}->>'earliest') asc nulls last`];
      case "birth_desc":
        return [sql`(${birthEvents.date}->>'earliest') desc nulls last`];
      case "surname_asc":
      default:
        return [asc(persons.surname), asc(persons.given)];
    }
  }

  /**
   * Per-person citation count and single highest-ranked confidence (by
   * `configurableOptions.sortOrder`) — feeds the People list's "Sources"
   * column. Only ever run over one page's worth of ids, not the whole table.
   */
  private async citationRollup(
    personIds: string[],
  ): Promise<Map<string, { count: number; topConfidence: string | null }>> {
    if (personIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        personId: citations.personId,
        confidence: citations.confidence,
        sortOrder: configurableOptions.sortOrder,
      })
      .from(citations)
      .leftJoin(
        configurableOptions,
        and(
          eq(configurableOptions.topic, "confidence"),
          eq(configurableOptions.key, citations.confidence),
        ),
      )
      .where(inArray(citations.personId, personIds));

    const byPerson = new Map<
      string,
      { count: number; topConfidence: string | null; topSortOrder: number }
    >();
    for (const row of rows) {
      const existing = byPerson.get(row.personId) ?? {
        count: 0,
        topConfidence: null,
        topSortOrder: -Infinity,
      };
      existing.count += 1;
      const sortOrder = row.sortOrder ?? -Infinity;
      if (existing.topConfidence === null || sortOrder > existing.topSortOrder) {
        existing.topConfidence = row.confidence;
        existing.topSortOrder = sortOrder;
      }
      byPerson.set(row.personId, existing);
    }
    return new Map(
      [...byPerson].map(([id, value]) => [
        id,
        { count: value.count, topConfidence: value.topConfidence },
      ]),
    );
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

  /**
   * `relationshipToRoot` is optional in the return type, not always-present,
   * because the frontend also reuses this same `PersonRow`-shaped type as a
   * generic "person object" stand-in for data that actually came from
   * `list`/`relatives` (which don't compute it) — see e.g. `Combobox<PersonRow>`
   * search results in `$personId.tsx`. Making it required there would force
   * every one of those unrelated call sites to fake the field.
   */
  async byId(
    id: string,
    viewerUserId: string,
  ): Promise<PersonWithVitals & { relationshipToRoot?: RelationshipToRoot }> {
    const [person, relationshipToRoot] = await Promise.all([
      this.getOneWithVitals(this.db, id),
      this.relationshipToRoot(id, viewerUserId),
    ]);
    return { ...person, relationshipToRoot };
  }

  /**
   * Relative to whichever account is viewing — each logged-in user has their
   * own "this is me" link (`userProfiles.personId`, set from the Profile
   * page), not one tree-wide root, so two accounts looking at the same
   * person can see different badges. Only computed for a single person's own
   * page (`byId`) — not folded into `getOneWithVitals`, which backs the
   * list/tree/relatives reads too and would otherwise run an extra graph
   * traversal per row for something only ever shown one person at a time.
   */
  private async relationshipToRoot(id: string, viewerUserId: string): Promise<RelationshipToRoot> {
    const [profile] = await this.db
      .select({ personId: userProfiles.personId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, viewerUserId))
      .limit(1);
    const rootId = profile?.personId;
    if (!rootId) return null;
    if (rootId === id) return "root";

    const [ancestors, descendants] = await Promise.all([
      ancestorsOf(this.pool, rootId),
      descendantsOf(this.pool, rootId),
    ]);
    if (ancestors.some((node) => node.personId === id)) return "ancestor";
    if (descendants.some((node) => node.personId === id)) return "descendant";
    return null;
  }

  private async getOneWithVitals(db: Database, id: string): Promise<PersonWithVitals> {
    const [row] = await personsWithVitals(db).where(eq(persons.id, id)).limit(1);
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
  async create(input: CreatePerson): Promise<PersonWithVitals> {
    const {
      birth,
      birthPlace,
      death,
      deathPlace,
      causeOfDeath,
      burial,
      burialPlace,
      ...personInput
    } = input;
    const resolvedBirth = resolveDate(birth);
    const resolvedDeath = resolveDate(death);
    const resolvedBurial = resolveDate(burial);
    for (let attempt = 1; ; attempt++) {
      try {
        // Each attempt must fully resolve before the next can know whether a
        // retry is even needed — nothing here is parallelizable.
        // eslint-disable-next-line no-await-in-loop
        return await inGraphTransaction(this.pool, async (client) => {
          const tx = createDatabase(client);
          const [row] = await tx
            .insert(persons)
            .values({ ...personInput, publicId: generatePublicId() })
            .returning();
          if (!row) {
            throw new Error("Insert returned no row");
          }
          await upsertPersonNode(this.pool, row.id, { client });
          await this.upsertVitalEvent(tx, row.id, "birth", resolvedBirth, birthPlace);
          await this.upsertVitalEvent(
            tx,
            row.id,
            "death",
            resolvedDeath,
            deathPlace,
            causeOfDeath !== undefined ? { causeOfDeath } : undefined,
          );
          await this.upsertVitalEvent(tx, row.id, "burial", resolvedBurial, burialPlace);
          return this.getOneWithVitals(tx, row.id);
        });
      } catch (error) {
        if (attempt >= 5 || !isUniqueViolation(error)) {
          throw error;
        }
      }
    }
  }

  /**
   * The graph node is keyed by `id` alone, so nothing there changes. Wrapped
   * in `inGraphTransaction` purely for its plain-Postgres transaction
   * semantics (the `persons` row and the vital event upserts below must
   * commit together) — no graph write happens here.
   */
  async update(input: UpdatePerson): Promise<PersonWithVitals> {
    const {
      id,
      birth,
      birthPlace,
      death,
      deathPlace,
      causeOfDeath,
      burial,
      burialPlace,
      ...patch
    } = input;
    const resolvedBirth = resolveDate(birth);
    const resolvedDeath = resolveDate(death);
    const resolvedBurial = resolveDate(burial);
    return inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      const [row] = await tx
        .update(persons)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(persons.id, id))
        .returning({ id: persons.id });
      if (!row) {
        throw new NotFoundException(`No person with id ${id}`);
      }
      await this.upsertVitalEvent(tx, id, "birth", resolvedBirth, birthPlace);
      await this.upsertVitalEvent(
        tx,
        id,
        "death",
        resolvedDeath,
        deathPlace,
        causeOfDeath !== undefined ? { causeOfDeath } : undefined,
      );
      await this.upsertVitalEvent(tx, id, "burial", resolvedBurial, burialPlace);
      return this.getOneWithVitals(tx, id);
    });
  }

  /**
   * Finds the person's existing "birth"/"death"/"burial" `person_events` row,
   * if any, and creates, updates, or deletes it to match — merging with
   * whatever wasn't touched by this call, so `date`/`place`/`detailsPatch`
   * can each be patched independently (mirrors `updatePersonEventSchema`'s
   * own field-by-field optionality). `detailsPatch` is merged key-by-key onto
   * whatever `details` the row already has (e.g. "death"'s `informant`, set
   * separately via the generic Add Event dialog) rather than replacing the
   * whole bag — a key mapped to `null`/blank removes just that key. A result
   * with no date, no place and an empty details bag left deletes the row
   * (and any citations pointing at it, same as `removeEvent`) rather than
   * leaving an empty event behind — this is what makes `create`/`update`
   * still feel like plain nullable `persons` columns from the caller's side,
   * even though they're `person_events` rows underneath.
   */
  private async upsertVitalEvent(
    tx: Database,
    personId: string,
    eventType: "birth" | "death" | "burial",
    date: HistoricalDate | null | undefined,
    place: string | null | undefined,
    detailsPatch?: Record<string, string | null | undefined>,
  ): Promise<void> {
    if (date === undefined && place === undefined && detailsPatch === undefined) return;

    const [existing] = await tx
      .select({
        id: personEvents.id,
        date: personEvents.date,
        place: personEvents.place,
        details: personEvents.details,
      })
      .from(personEvents)
      .where(and(eq(personEvents.personId, personId), eq(personEvents.eventType, eventType)))
      .limit(1);

    const nextDate = date !== undefined ? date : (existing?.date ?? null);
    const nextPlace = place !== undefined ? place : (existing?.place ?? null);

    let nextDetails = existing?.details ?? null;
    if (detailsPatch !== undefined) {
      const merged = { ...nextDetails };
      for (const [key, value] of Object.entries(detailsPatch)) {
        if (value === null || value === undefined || value.trim() === "") {
          delete merged[key];
        } else {
          merged[key] = value.trim();
        }
      }
      nextDetails = Object.keys(merged).length > 0 ? merged : null;
    }

    if (nextDate === null && nextPlace === null && nextDetails === null) {
      if (existing) {
        await tx.delete(personEvents).where(eq(personEvents.id, existing.id));
        await tx
          .delete(citations)
          .where(and(eq(citations.factType, "event"), eq(citations.factId, existing.id)));
      }
      return;
    }

    if (existing) {
      await tx
        .update(personEvents)
        .set({ date: nextDate, place: nextPlace, details: nextDetails, updatedAt: new Date() })
        .where(eq(personEvents.id, existing.id));
    } else {
      await tx
        .insert(personEvents)
        .values({ personId, eventType, date: nextDate, place: nextPlace, details: nextDetails });
    }
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
    const person = await this.getOneWithVitals(this.db, id);
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
  async setPhoto(id: string, file: UploadedPhoto): Promise<PersonWithVitals> {
    const person = await this.getOneWithVitals(this.db, id);
    const uploadsDir = this.config.getOrThrow<string>("UPLOADS_DIR");
    await mkdir(uploadsDir, { recursive: true });

    const ext = extname(file.originalname) || MIME_EXTENSIONS[file.mimetype] || "";
    const filename = `${id}-${randomUUID()}${ext}`;
    await writeFile(join(uploadsDir, filename), file.buffer);

    if (person.photoPath) {
      await rm(join(uploadsDir, person.photoPath), { force: true });
    }

    await this.db
      .update(persons)
      .set({ photoPath: filename, updatedAt: new Date() })
      .where(eq(persons.id, id));
    return this.getOneWithVitals(this.db, id);
  }

  async removePhoto(id: string): Promise<PersonWithVitals> {
    const person = await this.getOneWithVitals(this.db, id);
    if (person.photoPath) {
      const uploadsDir = this.config.getOrThrow<string>("UPLOADS_DIR");
      await rm(join(uploadsDir, person.photoPath), { force: true });
    }

    await this.db
      .update(persons)
      .set({ photoPath: null, updatedAt: new Date() })
      .where(eq(persons.id, id));
    return this.getOneWithVitals(this.db, id);
  }

  /** Direct parents, spouses and children, resolved to full rows for display. */
  async relatives(id: string): Promise<RelativesResult> {
    const [parentEdges, spouseNodes, childNodes] = await Promise.all([
      parentsOf(this.pool, id),
      spousesOf(this.pool, id),
      descendantsOf(this.pool, id, 1),
    ]);

    const ids = [
      ...new Set([...parentEdges, ...spouseNodes, ...childNodes].map((node) => node.personId)),
    ];
    const rows =
      ids.length > 0 ? await personsWithVitals(this.db).where(inArray(persons.id, ids)) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const toRows = (nodes: PedigreeNode[]): PersonWithVitals[] =>
      nodes.flatMap((node) => byId.get(node.personId) ?? []);

    return {
      parents: parentEdges.flatMap((edge) => {
        const row = byId.get(edge.personId);
        return row ? [{ ...row, parentage: edge.parentage }] : [];
      }),
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

  /**
   * Everyone and every edge the tree view needs to draw a graph centered on
   * `id`: their ancestors, descendants, and everyone's spouses, resolved to
   * full rows for display (see `treeAround` for why this is several
   * generation-at-a-time queries rather than one).
   */
  async tree(id: string, ancestorGenerations: number, descendantGenerations: number) {
    await this.getOneWithVitals(this.db, id);
    const graph = await treeAround(this.pool, id, ancestorGenerations, descendantGenerations);
    const people =
      graph.personIds.length > 0
        ? await personsWithVitals(this.db).where(inArray(persons.id, graph.personIds))
        : [];
    return {
      rootId: id,
      people,
      parentEdges: graph.parentEdges,
      spouseEdges: graph.spouseEdges,
      parentsKnownIds: graph.parentsKnownIds,
      childrenKnownIds: graph.childrenKnownIds,
    } satisfies TreeResult;
  }

  /** Birth name, married name(s), spelling variants found in records. */
  async listNames(personId: string): Promise<PersonNameRow[]> {
    return this.db.select().from(personNames).where(eq(personNames.personId, personId));
  }

  async addName(input: CreateNameVariant): Promise<PersonNameRow> {
    const values = { ...input, since: resolveDate(input.since) };
    const [row] = await this.db.insert(personNames).values(values).returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  async updateName(input: UpdateNameVariant): Promise<PersonNameRow> {
    const { id, ...patch } = input;
    const values = { ...patch, since: resolveDate(patch.since) };
    const [row] = await this.db
      .update(personNames)
      .set(values)
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

  /**
   * "birth"/"death" are guarded here, not by a database constraint: the
   * person page treats them as a single pair of fields (via `update`'s
   * `upsertVitalEvent`), so a second one arriving through this generic
   * add-event path — the frontend's own "+ Add event" dialog excludes them
   * from its type choices, but this is the actual enforcement boundary —
   * would leave two "canonical" birth dates with no way to tell which one
   * the person form should show.
   */
  async addEvent(input: CreatePersonEvent): Promise<PersonEventRow> {
    if (input.eventType === "birth" || input.eventType === "death") {
      const [existing] = await this.db
        .select({ id: personEvents.id })
        .from(personEvents)
        .where(
          and(
            eq(personEvents.personId, input.personId),
            eq(personEvents.eventType, input.eventType),
          ),
        )
        .limit(1);
      if (existing) {
        throw new BadRequestException(
          `This person already has a ${input.eventType} event — edit it from the person page instead of adding another.`,
        );
      }
    }
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
}
