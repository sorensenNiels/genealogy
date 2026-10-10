import { rm } from "node:fs/promises";
import { join } from "node:path";

import { formatLifespan, formatPersonName } from "@genealogy/core";
import {
  addParentOf,
  addSpouseOf,
  ancestorsOf,
  associations,
  childrenOf,
  citations,
  configurableOptions,
  createDatabase,
  deletePersonNode,
  descendantsOf,
  inGraphTransaction,
  parentsOf,
  personEvents,
  personExternalIds,
  personImmichLinks,
  personNames,
  persons,
  personsWithVitals,
  researchNotes,
  spousesOf,
  unions,
  userProfiles,
  type Database,
} from "@genealogy/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, count, eq, inArray, or } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";
import { RecordService } from "../records/record.service.js";

/** Why a merge can't go ahead — translated in the frontend. */
export type MergeBlocker =
  | "samePerson"
  | "directlyRelated"
  | "sameLineage"
  | "bothLinkedToAccounts";

/** What merging `removeId` into `keepId` would move — the duplicate's side only. */
export interface MergePreview {
  duplicate: { id: string; publicId: string; name: string; lifespan: string | null };
  blockers: MergeBlocker[];
  /** The duplicate's own name, when it differs from the kept person's — kept as an alternate name. */
  addsAlternateName: string | null;
  names: number;
  events: number;
  /** A second birth/death that becomes an "other" event, since a person has at most one of each. */
  vitalConflicts: number;
  unions: number;
  parents: number;
  children: number;
  spouses: number;
  citations: number;
  associations: number;
  researchNotes: number;
  photoLinks: number;
  externalIds: number;
  /** The duplicate's profile photo is used only when the kept person has none. */
  takesPhoto: boolean;
  /**
   * Names, events, unions and research notes the duplicate has that are
   * identical to one the kept person already has — dropped rather than
   * doubled, their citations and roles pointed at the surviving row. (Two
   * copies of the same import are the common case this is for.)
   */
  identical: number;
}

const VITAL_TYPES = ["birth", "death"] as const;

/**
 * Merges a duplicate person into the one being kept: every row and graph
 * edge the duplicate owns moves over, gaps on the kept person are filled
 * from the duplicate (never overwritten), and the duplicate is deleted —
 * all in one `inGraphTransaction`, so the two stores can't end up half
 * merged. Built for cleaning up after a GEDCOM import, which adds everyone
 * as new people; duplicate detection can later just point here.
 */
@Injectable()
export class PersonMergeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
    private readonly records: RecordService,
  ) {}

  async preview(keepId: string, removeId: string): Promise<MergePreview> {
    const [keep, duplicate] = await Promise.all([this.vitals(keepId), this.vitals(removeId)]);
    const blockers = await this.blockers(keepId, removeId);

    const countWhere = async (
      table: typeof personNames | typeof personEvents | typeof citations | typeof researchNotes,
    ) => {
      const [row] = await this.db
        .select({ value: count() })
        .from(table)
        .where(eq(table.personId, removeId));
      return row?.value ?? 0;
    };
    const [
      names,
      events,
      citationCount,
      notes,
      vitalRows,
      keepVitals,
      unionRows,
      associationRows,
      photoLinks,
      duplicateIds,
      keepIds,
      graph,
    ] = await Promise.all([
      countWhere(personNames),
      countWhere(personEvents),
      countWhere(citations),
      countWhere(researchNotes),
      this.vitalTypes(this.db, removeId),
      this.vitalTypes(this.db, keepId),
      this.db
        .select({ value: count() })
        .from(unions)
        .where(or(eq(unions.personAId, removeId), eq(unions.personBId, removeId))),
      this.db
        .select({ value: count() })
        .from(associations)
        .where(
          or(eq(associations.personId, removeId), eq(associations.associatePersonId, removeId)),
        ),
      this.db
        .select({ value: count() })
        .from(personImmichLinks)
        .where(eq(personImmichLinks.personId, removeId)),
      this.externalIdKeys(this.db, removeId),
      this.externalIdKeys(this.db, keepId),
      this.graphOf(removeId),
    ]);

    const identical = await this.identicalRows(this.db, keepId, removeId);
    return {
      identical:
        identical.names.size + identical.events.size + identical.unions.size + identical.notes.size,
      duplicate: {
        id: duplicate.id,
        publicId: duplicate.publicId,
        name: formatPersonName(duplicate),
        lifespan: formatLifespan(duplicate),
      },
      blockers,
      addsAlternateName: sameName(keep, duplicate) ? null : formatPersonName(duplicate),
      names,
      events,
      vitalConflicts:
        vitalRows.filter((type) => keepVitals.includes(type)).length - identical.vitals,
      unions: unionRows[0]?.value ?? 0,
      parents: graph.parents.filter((edge) => edge.personId !== keepId).length,
      children: graph.children.filter((edge) => edge.personId !== keepId).length,
      spouses: graph.spouses.filter((spouse) => spouse !== keepId).length,
      citations: citationCount,
      associations: associationRows[0]?.value ?? 0,
      researchNotes: notes,
      photoLinks: photoLinks[0]?.value ?? 0,
      externalIds: [...duplicateIds].filter((key) => !keepIds.has(key)).length,
      takesPhoto: !keep.photoPath && !!duplicate.photoPath,
    };
  }

  async merge(keepId: string, removeId: string): Promise<void> {
    const blockers = await this.blockers(keepId, removeId);
    if (blockers.length > 0) {
      throw new BadRequestException(`These two people can't be merged (${blockers.join(", ")})`);
    }
    const [keep, duplicate] = await Promise.all([this.vitals(keepId), this.vitals(removeId)]);
    const graph = await this.graphOf(removeId);
    const keepGraph = await this.graphOf(keepId);
    const takesPhoto = !keep.photoPath && !!duplicate.photoPath;

    await inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      const optionKeys = await tx
        .select({
          topic: configurableOptions.topic,
          key: configurableOptions.key,
          label: configurableOptions.label,
        })
        .from(configurableOptions)
        .where(inArray(configurableOptions.topic, ["event_type", "name_variant_type"]));
      const hasOption = (topic: string, key: string) =>
        optionKeys.some((option) => option.topic === topic && option.key === key);
      const eventLabel = (key: string) =>
        optionKeys.find((option) => option.topic === "event_type" && option.key === key)?.label ??
        key;

      await this.dropIdenticalRows(tx, keepId, removeId);

      // A person has at most one birth and one death (see PersonService.addEvent);
      // the duplicate's second one is kept as an "other" event, the same way
      // GEDCOM import keeps a second birth.
      const keepVitals = await this.vitalTypes(tx, keepId);
      for (const type of VITAL_TYPES) {
        if (!keepVitals.includes(type)) continue;
        await tx
          .update(personEvents)
          .set({ eventType: "other", label: eventLabel(type) })
          .where(and(eq(personEvents.personId, removeId), eq(personEvents.eventType, type)));
      }

      // A role the two held on each other's records would become one person
      // naming themselves — dropped, with its citations (`factId` isn't an FK).
      const selfRoles = await tx
        .select({ id: associations.id })
        .from(associations)
        .where(
          or(
            and(eq(associations.personId, removeId), eq(associations.associatePersonId, keepId)),
            and(eq(associations.personId, keepId), eq(associations.associatePersonId, removeId)),
          ),
        );
      if (selfRoles.length > 0) {
        const ids = selfRoles.map((row) => row.id);
        await tx
          .delete(citations)
          .where(and(eq(citations.factType, "association"), inArray(citations.factId, ids)));
        await tx.delete(associations).where(inArray(associations.id, ids));
      }

      // External ids the kept person already has would break the unique key.
      const keepIdKeys = await this.externalIdKeys(tx, keepId);
      const duplicateIdRows = await tx
        .select({
          id: personExternalIds.id,
          system: personExternalIds.system,
          value: personExternalIds.value,
        })
        .from(personExternalIds)
        .where(eq(personExternalIds.personId, removeId));
      const duplicateIdRowsToDrop = duplicateIdRows
        .filter((row) => keepIdKeys.has(`${row.system}|${row.value}`))
        .map((row) => row.id);
      if (duplicateIdRowsToDrop.length > 0) {
        await tx
          .delete(personExternalIds)
          .where(inArray(personExternalIds.id, duplicateIdRowsToDrop));
      }

      // Everything the duplicate owns moves over.
      await tx
        .update(personNames)
        .set({ personId: keepId })
        .where(eq(personNames.personId, removeId));
      await tx
        .update(personEvents)
        .set({ personId: keepId })
        .where(eq(personEvents.personId, removeId));
      await tx.update(unions).set({ personAId: keepId }).where(eq(unions.personAId, removeId));
      await tx.update(unions).set({ personBId: keepId }).where(eq(unions.personBId, removeId));
      await tx.update(citations).set({ personId: keepId }).where(eq(citations.personId, removeId));
      await tx
        .update(associations)
        .set({ personId: keepId })
        .where(eq(associations.personId, removeId));
      await tx
        .update(associations)
        .set({ associatePersonId: keepId })
        .where(eq(associations.associatePersonId, removeId));
      await tx
        .update(researchNotes)
        .set({ personId: keepId })
        .where(eq(researchNotes.personId, removeId));
      await this.records.repointPerson(tx, removeId, keepId);
      await tx
        .update(personImmichLinks)
        .set({ personId: keepId })
        .where(eq(personImmichLinks.personId, removeId));
      await tx
        .update(personExternalIds)
        .set({ personId: keepId })
        .where(eq(personExternalIds.personId, removeId));
      // Safe: `blockers` refused the case where both have an account link.
      await tx
        .update(userProfiles)
        .set({ personId: keepId })
        .where(eq(userProfiles.personId, removeId));

      // The duplicate's own name, if spelled differently, stays findable.
      if (!sameName(keep, duplicate)) {
        const nameType = ["alternate_spelling", "other"].find((key) =>
          hasOption("name_variant_type", key),
        );
        if (nameType) {
          await tx.insert(personNames).values({
            personId: keepId,
            nameType,
            given: duplicate.given,
            surname: duplicate.surname,
          });
        }
      }

      // Gaps on the kept person are filled; nothing already there is overwritten.
      await tx
        .update(persons)
        .set({
          gender: keep.gender === "U" ? duplicate.gender : keep.gender,
          titlePrefix: keep.titlePrefix ?? duplicate.titlePrefix,
          suffix: keep.suffix ?? duplicate.suffix,
          // Deceased wins: one of the two records knew they had died.
          isLiving: keep.isLiving && duplicate.isLiving,
          restriction: keep.restriction ?? duplicate.restriction,
          photoPath: takesPhoto ? duplicate.photoPath : keep.photoPath,
          // Joined when both have notes, once when they're the same text.
          notes: joinDistinct(keep.notes, duplicate.notes),
          updatedAt: new Date(),
        })
        .where(eq(persons.id, keepId));

      // Graph: the duplicate's edges move to the kept person. An edge the
      // kept person already has stays as it is (its parentage wins).
      const keepParents = new Set(keepGraph.parents.map((edge) => edge.personId));
      const keepChildren = new Set(keepGraph.children.map((edge) => edge.personId));
      const keepSpouses = new Set(keepGraph.spouses);
      for (const edge of graph.parents) {
        if (edge.personId === keepId || keepParents.has(edge.personId)) continue;
        await addParentOf(this.pool, edge.personId, keepId, edge.parentage, { client });
      }
      for (const edge of graph.children) {
        if (edge.personId === keepId || keepChildren.has(edge.personId)) continue;
        await addParentOf(this.pool, keepId, edge.personId, edge.parentage, { client });
      }
      for (const spouseId of graph.spouses) {
        if (spouseId === keepId || keepSpouses.has(spouseId)) continue;
        await addSpouseOf(this.pool, keepId, spouseId, { client });
      }

      await this.collapseIdenticalCitations(tx, keepId);

      await tx.delete(persons).where(eq(persons.id, removeId));
      await deletePersonNode(this.pool, removeId, { client });
    });

    // Only once the merge has committed: the duplicate's own photo file,
    // unless the kept person took it over.
    if (duplicate.photoPath && !takesPhoto) {
      const uploadsDir = this.config.getOrThrow<string>("UPLOADS_DIR");
      await rm(join(uploadsDir, duplicate.photoPath), { force: true });
    }
  }

  /**
   * The duplicate's rows that match one of the kept person's exactly, as
   * duplicate row id → kept row id per kind. Unions match on the other
   * partner and the dates; associations aren't matched here — once their
   * event/union is re-pointed, `dropIdenticalRows` catches doubles among them.
   */
  private async identicalRows(db: Database, keepId: string, removeId: string) {
    // Sequential, not Promise.all: inside the merge `db` is one transaction's
    // connection, and pg doesn't allow overlapping queries on a client.
    const names = await db
      .select()
      .from(personNames)
      .where(inArray(personNames.personId, [keepId, removeId]));
    const events = await db
      .select()
      .from(personEvents)
      .where(inArray(personEvents.personId, [keepId, removeId]));
    const unionRows = await db
      .select()
      .from(unions)
      .where(
        or(
          inArray(unions.personAId, [keepId, removeId]),
          inArray(unions.personBId, [keepId, removeId]),
        ),
      );
    const notes = await db
      .select()
      .from(researchNotes)
      .where(inArray(researchNotes.personId, [keepId, removeId]));
    const eventKey = (row: (typeof events)[number]) =>
      JSON.stringify([
        row.eventType,
        row.label,
        row.date?.original ?? null,
        row.place,
        Object.entries(row.details ?? {}).toSorted(),
        row.notes,
      ]);
    const eventPairs = matchRows(events, (row) => row.personId === keepId, eventKey);
    const partnerOf = (row: (typeof unionRows)[number], self: string) =>
      row.personAId === self ? row.personBId : row.personAId;
    const unionPairs = matchRows(
      unionRows,
      (row) => row.personAId === keepId || row.personBId === keepId,
      (row) => {
        const self = row.personAId === keepId || row.personBId === keepId ? keepId : removeId;
        return JSON.stringify([
          partnerOf(row, self),
          row.status,
          row.startDate?.original ?? null,
          row.startPlace,
          row.endDate?.original ?? null,
          row.endPlace,
        ]);
      },
    );
    return {
      names: matchRows(
        names,
        (row) => row.personId === keepId,
        (row) =>
          JSON.stringify([row.nameType, row.given, row.surname, row.since?.original ?? null]),
      ),
      events: eventPairs,
      vitals: events.filter(
        (row) => eventPairs.has(row.id) && (row.eventType === "birth" || row.eventType === "death"),
      ).length,
      unions: unionPairs,
      notes: matchRows(
        notes,
        (row) => row.personId === keepId,
        (row) => JSON.stringify([row.noteType, row.body]),
      ),
    };
  }

  /** Drops the duplicate's identical rows, first pointing their citations and roles at the kept twin. */
  private async dropIdenticalRows(tx: Database, keepId: string, removeId: string): Promise<void> {
    const identical = await this.identicalRows(tx, keepId, removeId);
    const repoint = async (factType: "name" | "event" | "union", pairs: Map<string, string>) => {
      for (const [duplicateId, keptId] of pairs) {
        await tx
          .update(citations)
          .set({ factId: keptId })
          .where(and(eq(citations.factType, factType), eq(citations.factId, duplicateId)));
      }
    };
    await repoint("name", identical.names);
    await repoint("event", identical.events);
    await repoint("union", identical.unions);
    for (const [duplicateId, keptId] of identical.events) {
      await tx
        .update(associations)
        .set({ eventId: keptId })
        .where(eq(associations.eventId, duplicateId));
    }
    for (const [duplicateId, keptId] of identical.unions) {
      await tx
        .update(associations)
        .set({ unionId: keptId })
        .where(eq(associations.unionId, duplicateId));
    }
    const drop = async (
      table: typeof personNames | typeof personEvents | typeof researchNotes | typeof unions,
      ids: Iterable<string>,
    ) => {
      const list = [...ids];
      if (list.length > 0) await tx.delete(table).where(inArray(table.id, list));
    };
    await drop(personNames, identical.names.keys());
    await drop(personEvents, identical.events.keys());
    await drop(unions, identical.unions.keys());
    await drop(researchNotes, identical.notes.keys());
  }

  /**
   * After everything has moved, the same source cited for the same fact in
   * the same words twice — and the same role recorded twice — is one, not two.
   */
  private async collapseIdenticalCitations(tx: Database, keepId: string): Promise<void> {
    // Every role connected to the kept person: on their records, held by
    // them, or tied to one of their events or marriages (a marriage witness
    // belongs to whichever partner owns the union row).
    const eventRows = await tx
      .select({ id: personEvents.id })
      .from(personEvents)
      .where(eq(personEvents.personId, keepId));
    const unionRows = await tx
      .select({ id: unions.id })
      .from(unions)
      .where(or(eq(unions.personAId, keepId), eq(unions.personBId, keepId)));
    const roleScope = [
      eq(associations.personId, keepId),
      eq(associations.associatePersonId, keepId),
      ...(eventRows.length > 0
        ? [
            inArray(
              associations.eventId,
              eventRows.map((row) => row.id),
            ),
          ]
        : []),
      ...(unionRows.length > 0
        ? [
            inArray(
              associations.unionId,
              unionRows.map((row) => row.id),
            ),
          ]
        : []),
    ];
    const roles = await tx
      .select()
      .from(associations)
      .where(or(...roleScope));
    const owners = new Set([keepId, ...roles.map((row) => row.personId)]);
    const seenRoles = new Map<string, string>();
    for (const row of roles) {
      const key = JSON.stringify([
        row.personId,
        row.associatePersonId,
        row.associateName,
        row.role,
        row.label,
        row.eventId,
        row.unionId,
        row.notes,
      ]);
      const keptId = seenRoles.get(key);
      if (!keptId) {
        seenRoles.set(key, row.id);
        continue;
      }
      await tx
        .update(citations)
        .set({ factId: keptId })
        .where(and(eq(citations.factType, "association"), eq(citations.factId, row.id)));
      await tx.delete(associations).where(eq(associations.id, row.id));
    }

    const rows = await tx
      .select()
      .from(citations)
      .where(inArray(citations.personId, [...owners]));
    const seen = new Set<string>();
    const doubles: string[] = [];
    for (const row of rows) {
      const key = JSON.stringify([
        row.personId,
        row.sourceId,
        row.factType,
        row.factId,
        row.page,
        row.volume,
        row.entryId,
        row.certificateNumber,
        row.confidence,
        row.note,
        row.ancestryApid,
      ]);
      if (seen.has(key)) doubles.push(row.id);
      else seen.add(key);
    }
    if (doubles.length > 0) await tx.delete(citations).where(inArray(citations.id, doubles));
  }

  private async blockers(keepId: string, removeId: string): Promise<MergeBlocker[]> {
    if (keepId === removeId) return ["samePerson"];
    const blockers: MergeBlocker[] = [];
    const [keepGraph, ancestors, descendants, accountLinks] = await Promise.all([
      this.graphOf(keepId),
      ancestorsOf(this.pool, keepId),
      descendantsOf(this.pool, keepId),
      this.db
        .select({ personId: userProfiles.personId })
        .from(userProfiles)
        .where(inArray(userProfiles.personId, [keepId, removeId])),
    ]);
    if (
      keepGraph.parents.some((edge) => edge.personId === removeId) ||
      keepGraph.children.some((edge) => edge.personId === removeId) ||
      keepGraph.spouses.includes(removeId)
    ) {
      blockers.push("directlyRelated");
    } else if (
      // Merging someone into their own (depth-capped) ancestor or descendant
      // would make them their own ancestor.
      ancestors.some((node) => node.personId === removeId) ||
      descendants.some((node) => node.personId === removeId)
    ) {
      blockers.push("sameLineage");
    }
    if (accountLinks.length === 2) blockers.push("bothLinkedToAccounts");
    return blockers;
  }

  private async vitals(id: string) {
    const [row] = await personsWithVitals(this.db).where(eq(persons.id, id));
    if (!row) throw new NotFoundException(`No person with id ${id}`);
    return row;
  }

  private async vitalTypes(db: Database, personId: string): Promise<string[]> {
    const rows = await db
      .select({ eventType: personEvents.eventType })
      .from(personEvents)
      .where(
        and(eq(personEvents.personId, personId), inArray(personEvents.eventType, [...VITAL_TYPES])),
      );
    return rows.map((row) => row.eventType);
  }

  private async externalIdKeys(db: Database, personId: string): Promise<Set<string>> {
    const rows = await db
      .select({ system: personExternalIds.system, value: personExternalIds.value })
      .from(personExternalIds)
      .where(eq(personExternalIds.personId, personId));
    return new Set(rows.map((row) => `${row.system}|${row.value}`));
  }

  private async graphOf(personId: string) {
    const [parents, children, spouses] = await Promise.all([
      parentsOf(this.pool, personId),
      childrenOf(this.pool, personId),
      spousesOf(this.pool, personId),
    ]);
    return { parents, children, spouses: spouses.map((spouse) => spouse.personId) };
  }
}

function sameName(
  a: { given: string; surname: string },
  b: { given: string; surname: string },
): boolean {
  return (
    normalizeName(a.given) === normalizeName(b.given) &&
    normalizeName(a.surname) === normalizeName(b.surname)
  );
}

/** Both notes, blank-line separated — or one, when they're the same text. */
function joinDistinct(a: string | null, b: string | null): string | null {
  const parts = [a?.trim(), b?.trim()].filter((part): part is string => !!part);
  return [...new Set(parts)].join("\n\n") || null;
}

/** Pairs each of the duplicate's rows with the kept person's row of the same `key`, as duplicate id → kept id. */
function matchRows<T extends { id: string }>(
  rows: T[],
  isKeep: (row: T) => boolean,
  key: (row: T) => string,
): Map<string, string> {
  const kept = new Map<string, string>();
  for (const row of rows) if (isKeep(row)) kept.set(key(row), row.id);
  const pairs = new Map<string, string>();
  for (const row of rows) {
    if (isKeep(row)) continue;
    const keptId = kept.get(key(row));
    if (keptId) pairs.set(row.id, keptId);
  }
  return pairs;
}

function normalizeName(text: string): string {
  return text.trim().toLowerCase();
}
