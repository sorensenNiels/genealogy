import { randomUUID } from "node:crypto";

import {
  GedcomImportError,
  countGedcomImportPlan,
  planGedcomImport,
  type ConfigurableTopic,
  type GedcomImportAssociation,
  type GedcomImportCitation,
  type GedcomImportCounts,
  type GedcomImportInput,
  type GedcomImportPlan,
  type GedcomImportVocabulary,
  type GedcomImportWarning,
} from "@genealogy/core";
import {
  addParentOfMany,
  addSpouseOfMany,
  associations,
  citations,
  configurableOptions,
  createDatabase,
  createPersonNodes,
  inGraphTransaction,
  personEvents,
  personNames,
  persons,
  personExternalIds,
  places,
  repositories,
  researchNotes,
  sources,
  unions,
  type Database,
} from "@genealogy/db";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";
import { generatePublicId } from "../person/public-id.js";
import { SettingsService } from "../settings/settings.service.js";

/** Rows per multi-row INSERT — far under Postgres's 65,535 bind-parameter cap for even the widest table here. */
const INSERT_CHUNK_SIZE = 1000;

/** How many incoming people with a possible match the preview lists by name; the rest are only counted. */
const MAX_LISTED_DUPLICATES = 50;

interface DuplicateCandidate {
  given: string;
  surname: string;
  birth: string | null;
}

export interface GedcomImportPreview {
  header: GedcomImportPlan["header"];
  counts: GedcomImportCounts;
  warnings: GedcomImportWarning[];
  unmappedEventTypes: GedcomImportPlan["unmappedEventTypes"];
  /** Incoming people whose name matches someone already in the tree — informational only, see `preview`. */
  possibleDuplicates: {
    /** `ref` is the incoming person's xref in the file — unique within it, unlike their name. */
    incoming: DuplicateCandidate & { ref: string };
    existing: (DuplicateCandidate & { id: string })[];
  }[];
  possibleDuplicateCount: number;
}

/**
 * GEDCOM import: every incoming person is added as a *new* person, in one
 * transaction spanning Postgres and the AGE graph. Matching an incoming
 * person against someone already in the tree is deliberately not attempted
 * — `preview` only reports likely matches (same rule as the integrity
 * check's "possible duplicates"), so the user can decide before importing,
 * and merge afterwards. See "GEDCOM import" in TECH_STACK.md.
 *
 * Stateless across the two calls: `import` re-parses the same text `preview`
 * saw rather than the server holding a parsed plan between requests —
 * parsing is milliseconds, server-side session state is not free.
 */
@Injectable()
export class GedcomImportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly settings: SettingsService,
  ) {}

  async preview(input: GedcomImportInput): Promise<GedcomImportPreview> {
    const plan = await this.plan(input);

    const existing = await this.db
      .select({
        id: persons.id,
        given: persons.given,
        surname: persons.surname,
        birth: personEvents.date,
      })
      .from(persons)
      .leftJoin(
        personEvents,
        and(eq(personEvents.personId, persons.id), eq(personEvents.eventType, "birth")),
      )
      .orderBy(asc(persons.surname), asc(persons.given));
    const existingByName = new Map<string, (DuplicateCandidate & { id: string })[]>();
    for (const row of existing) {
      const key = duplicateKey(row);
      if (!key) continue;
      const group = existingByName.get(key) ?? [];
      group.push({
        id: row.id,
        given: row.given,
        surname: row.surname,
        birth: row.birth?.original ?? null,
      });
      existingByName.set(key, group);
    }

    const possibleDuplicates: GedcomImportPreview["possibleDuplicates"] = [];
    let possibleDuplicateCount = 0;
    for (const person of plan.persons) {
      const key = duplicateKey(person);
      const matches = key ? existingByName.get(key) : undefined;
      if (!matches) continue;
      possibleDuplicateCount += 1;
      if (possibleDuplicates.length < MAX_LISTED_DUPLICATES) {
        const birth = person.events.find((event) => event.eventType === "birth");
        possibleDuplicates.push({
          incoming: {
            ref: person.ref,
            given: person.given,
            surname: person.surname,
            birth: birth?.date?.original ?? null,
          },
          existing: matches,
        });
      }
    }

    return {
      header: plan.header,
      counts: countGedcomImportPlan(plan),
      warnings: plan.warnings,
      unmappedEventTypes: plan.unmappedEventTypes,
      possibleDuplicates,
      possibleDuplicateCount,
    };
  }

  async import(input: GedcomImportInput): Promise<GedcomImportCounts> {
    const plan = await this.plan(input);
    if (plan.persons.length === 0) {
      throw new BadRequestException("This GEDCOM file contains no people");
    }
    for (let attempt = 1; ; attempt++) {
      try {
        // A retry only happens after the previous attempt fully rolled back.
        // eslint-disable-next-line no-await-in-loop
        return await this.write(plan);
      } catch (error) {
        // Same publicId-collision retry as `PersonService.create`, applied to
        // the whole batch — a collision against an existing row is no less
        // unlikely here, there are just more draws.
        if (attempt >= 5 || !isUniqueViolation(error)) throw error;
      }
    }
  }

  private async plan(input: GedcomImportInput): Promise<GedcomImportPlan> {
    const [vocabulary, personSettings] = await Promise.all([
      this.vocabulary(),
      this.settings.getPersonSettings(),
    ]);
    try {
      return planGedcomImport(input.text, {
        vocabulary,
        presumeDeceasedAfterYears: personSettings.presumeDeceasedAfterYears,
        ...(input.encoding ? { encoding: input.encoding } : {}),
      });
    } catch (error) {
      if (error instanceof GedcomImportError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async vocabulary(): Promise<GedcomImportVocabulary> {
    const rows = await this.db
      .select({
        topic: configurableOptions.topic,
        key: configurableOptions.key,
        label: configurableOptions.label,
      })
      .from(configurableOptions)
      .orderBy(asc(configurableOptions.sortOrder));
    const vocabulary: Partial<Record<ConfigurableTopic, { key: string; label: string }[]>> = {};
    for (const row of rows) {
      const topic = row.topic as ConfigurableTopic;
      (vocabulary[topic] ??= []).push({ key: row.key, label: row.label });
    }
    return vocabulary;
  }

  private async write(plan: GedcomImportPlan): Promise<GedcomImportCounts> {
    // Ids are minted here rather than read back from `RETURNING`, so every
    // foreign key (citation → source, event → person, ...) is known up front
    // and each table goes in as a handful of multi-row inserts.
    const sourceIds = new Map(plan.sources.map((source) => [source.ref, randomUUID()]));
    const repositoryIds = new Map(plan.repositories.map((repo) => [repo.ref, randomUUID()]));
    const externalIdRows: (typeof personExternalIds.$inferInsert)[] = [];
    const personIds = new Map(plan.persons.map((person) => [person.ref, randomUUID()]));
    const personId = (ref: string): string => {
      const id = personIds.get(ref);
      if (!id) throw new Error(`GEDCOM import plan references unknown person ${ref}`);
      return id;
    };

    const publicIds = new Set<string>();
    while (publicIds.size < plan.persons.length) publicIds.add(generatePublicId());
    const publicIdList = [...publicIds];

    const personRows: (typeof persons.$inferInsert)[] = [];
    const nameRows: (typeof personNames.$inferInsert)[] = [];
    const eventRows: (typeof personEvents.$inferInsert)[] = [];
    const unionRows: (typeof unions.$inferInsert)[] = [];
    const citationRows: (typeof citations.$inferInsert)[] = [];
    const associationRows: (typeof associations.$inferInsert)[] = [];
    const researchNoteRows: (typeof researchNotes.$inferInsert)[] = [];
    const cite = (
      list: GedcomImportCitation[],
      ownerId: string,
      factType: "person" | "name" | "event" | "union" | "association",
      factId: string | null,
    ): void => {
      for (const citation of list) {
        const sourceId = sourceIds.get(citation.sourceRef);
        if (!sourceId) continue;
        citationRows.push({
          sourceId,
          personId: ownerId,
          factType,
          factId,
          page: citation.page,
          volume: citation.volume,
          entryId: citation.entryId,
          certificateNumber: citation.certificateNumber,
          confidence: citation.confidence,
          note: citation.note,
          ancestryApid: citation.ancestryApid,
        });
      }
    };

    const associate = (
      association: GedcomImportAssociation,
      ownerId: string,
      context: { eventId?: string; unionId?: string },
    ): void => {
      const id = randomUUID();
      associationRows.push({
        id,
        personId: ownerId,
        eventId: context.eventId ?? null,
        unionId: context.unionId ?? null,
        associatePersonId: association.associateRef ? personId(association.associateRef) : null,
        associateName: association.associateRef ? null : association.associateName,
        role: association.role,
        label: association.label,
        notes: association.notes,
      });
      cite(association.citations, ownerId, "association", id);
    };

    plan.persons.forEach((person, index) => {
      const id = personId(person.ref);
      personRows.push({
        id,
        publicId: publicIdList[index]!,
        given: person.given,
        surname: person.surname,
        gender: person.gender,
        titlePrefix: person.titlePrefix,
        suffix: person.suffix,
        isLiving: person.isLiving,
        restriction: person.restriction,
        notes: person.notes,
      });
      cite(person.citations, id, "person", null);
      for (const name of person.names) {
        const nameId = randomUUID();
        nameRows.push({
          id: nameId,
          personId: id,
          nameType: name.nameType,
          given: name.given,
          surname: name.surname,
          since: name.since,
          notes: name.notes,
        });
        cite(name.citations, id, "name", nameId);
      }
      const eventIds: string[] = [];
      for (const event of person.events) {
        const eventId = randomUUID();
        eventIds.push(eventId);
        eventRows.push({
          id: eventId,
          personId: id,
          eventType: event.eventType,
          label: event.label,
          date: event.date,
          place: event.place,
          details: event.details,
          notes: event.notes,
        });
        cite(event.citations, id, "event", eventId);
      }
      for (const association of person.associations) associate(association, id, {});
      for (const association of person.eventAssociations) {
        const eventId = eventIds[association.eventIndex];
        associate(association, id, eventId ? { eventId } : {});
      }
      for (const externalId of person.externalIds) {
        externalIdRows.push({ personId: id, ...externalId });
      }
      for (const note of person.researchNotes) {
        researchNoteRows.push({ personId: id, ...note });
      }
    });

    for (const union of plan.unions) {
      const unionId = randomUUID();
      const personAId = personId(union.personARef);
      unionRows.push({
        id: unionId,
        personAId,
        personBId: personId(union.personBRef),
        status: union.status,
        startDate: union.startDate,
        startPlace: union.startPlace,
        endDate: union.endDate,
        endPlace: union.endPlace,
        notes: union.notes,
      });
      // A citation row needs one owning person; the union's first partner is
      // whose page it was "added from", same as citing a union by hand.
      cite(union.citations, personAId, "union", unionId);
      for (const association of union.associations) associate(association, personAId, { unionId });
    }

    return inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      // Order matters only for foreign keys: sources and persons before
      // anything that references them. Chunks run sequentially — they share
      // the transaction's single connection.
      /* eslint-disable no-await-in-loop */
      for (const chunk of chunked(
        plan.repositories.map((repo) => {
          const { ref, ...columns } = repo;
          return { id: repositoryIds.get(ref)!, ...columns };
        }),
      )) {
        await tx.insert(repositories).values(chunk);
      }
      for (const chunk of chunked(
        plan.sources.map((source) => ({
          id: sourceIds.get(source.ref)!,
          title: source.title,
          author: source.author,
          publication: source.publication,
          repositoryId: source.repositoryRef
            ? (repositoryIds.get(source.repositoryRef) ?? null)
            : null,
          callNumber: source.callNumber,
          sourceType: source.sourceType,
        })),
      )) {
        await tx.insert(sources).values(chunk);
      }
      for (const chunk of chunked(personRows)) await tx.insert(persons).values(chunk);
      for (const chunk of chunked(nameRows)) await tx.insert(personNames).values(chunk);
      for (const chunk of chunked(eventRows)) await tx.insert(personEvents).values(chunk);
      for (const chunk of chunked(unionRows)) await tx.insert(unions).values(chunk);
      for (const chunk of chunked(associationRows)) await tx.insert(associations).values(chunk);
      for (const chunk of chunked(citationRows)) await tx.insert(citations).values(chunk);
      for (const chunk of chunked(researchNoteRows)) await tx.insert(researchNotes).values(chunk);
      for (const chunk of chunked(externalIdRows)) {
        await tx.insert(personExternalIds).values(chunk).onConflictDoNothing();
      }
      // A place already in the table keeps its coordinates — they may have
      // been corrected by hand, and a file's are no more authoritative.
      // Only touched when the file has coordinates at all, so a file without
      // any still imports on a database whose PostGIS migration hasn't run.
      for (const chunk of chunked(plan.places)) {
        await tx
          .insert(places)
          .values(
            chunk.map((place) => ({
              name: place.name,
              location: { x: place.longitude, y: place.latitude },
            })),
          )
          .onConflictDoNothing({ target: places.name });
      }
      /* eslint-enable no-await-in-loop */

      const vertexIds = await createPersonNodes(this.pool, [...personIds.values()], { client });
      const vertex = (ref: string): number => {
        const id = vertexIds.get(personId(ref));
        if (id === undefined) throw new Error(`No graph node was created for person ${ref}`);
        return id;
      };
      await addParentOfMany(
        this.pool,
        plan.parentLinks.map((link) => ({
          parent: vertex(link.parentRef),
          child: vertex(link.childRef),
          parentage: link.parentage,
        })),
        { client },
      );
      await addSpouseOfMany(
        this.pool,
        plan.spouseLinks.map((link) => ({ a: vertex(link.aRef), b: vertex(link.bRef) })),
        { client },
      );

      return countGedcomImportPlan(plan);
    });
  }
}

/** Same name rule as `IntegrityService`'s possible-duplicates check, so the two agree on what "looks like the same person" means. */
function duplicateKey(person: { given: string; surname: string }): string | null {
  const surname = person.surname.trim().toLowerCase();
  if (surname === "") return null;
  return `${person.given.trim().toLowerCase()}|${surname}`;
}

function chunked<T>(rows: T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
    result.push(rows.slice(start, start + INSERT_CHUNK_SIZE));
  }
  return result;
}

/** Postgres SQLSTATE 23505, unwrapped from Drizzle's `DrizzleQueryError.cause` — see the copy in person.service.ts for why both places are checked. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  return code === "23505" || cause?.code === "23505";
}
