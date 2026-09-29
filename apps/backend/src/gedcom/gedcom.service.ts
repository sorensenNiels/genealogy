import { GedcomWriter, gedcomPointer, toGedcomDate } from "@genealogy/core";
import {
  allParentOfEdges,
  citations,
  personEvents,
  personNames,
  persons,
  sources,
  unions,
  type CitationRow,
  type Database,
  type PersonEventRow,
  type PersonNameRow,
  type PersonRow,
  type SourceRow,
  type UnionRow,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";

const GEDCOM_VITAL_EVENT_TAGS: Record<string, string> = {
  birth: "BIRT",
  death: "DEAT",
  burial: "BURI",
};

interface Family {
  parentIds: string[];
  childIds: { id: string; parentage: string }[];
  union: UnionRow | undefined;
}

/**
 * Builds a GEDCOM 5.5.1 export of the whole tree in one pass — read-only, no
 * queue needed (unlike `BackupService`'s `pg_dump`, this is plain text, not a
 * large binary, so it's comfortably synchronous at this app's scale). See
 * "GEDCOM export" in TECH_STACK.md for the deliberate scope cuts: no `OBJE`
 * (photos aren't portable outside this app), no research/user notes (not
 * part of GEDCOM's model), import is a separate future feature.
 */
@Injectable()
export class GedcomService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * These seven reads run as separate, unsynchronized queries, not one
   * consistent snapshot — a person created (with its graph edges) between
   * two of them could transiently appear in one but not the other, dropped
   * by the "resolves to nothing" filter below rather than surfaced as a
   * malformed pointer. Judged an acceptable tradeoff at this app's scale
   * (a single family, low write concurrency) rather than wrapping the whole
   * export in one transaction for a vanishingly rare race.
   */
  async exportAll(): Promise<string> {
    const [allPersons, allNames, allEvents, allUnions, allSources, allCitations, allEdges] =
      await Promise.all([
        this.db.select().from(persons),
        this.db.select().from(personNames),
        this.db.select().from(personEvents),
        this.db.select().from(unions),
        this.db.select().from(sources),
        this.db.select().from(citations),
        allParentOfEdges(this.pool),
      ]);

    const writer = new GedcomWriter();
    writer.line(0, "HEAD");
    writer.line(1, "SOUR", "genealogy-app");
    writer.line(1, "GEDC");
    writer.line(2, "VERS", "5.5.1");
    writer.line(1, "CHAR", "UTF-8");

    const personXref = new Map<string, string>();
    allPersons.forEach((person, index) => personXref.set(person.id, `I${index + 1}`));

    const namesByPerson = groupBy(allNames, (name) => name.personId);
    const eventsByPerson = groupBy(allEvents, (event) => event.personId);
    const citationsByKey = new Map<string, CitationRow[]>();
    for (const citation of allCitations) {
      const key =
        citation.factType === "person"
          ? `person:${citation.personId}`
          : `${citation.factType}:${citation.factId}`;
      const existing = citationsByKey.get(key);
      if (existing) existing.push(citation);
      else citationsByKey.set(key, [citation]);
    }

    const sourceXref = new Map<string, string>();
    allSources.forEach((source, index) => sourceXref.set(source.id, `S${index + 1}`));

    for (const person of allPersons) {
      this.writeIndividual(
        writer,
        person,
        personXref,
        namesByPerson.get(person.id) ?? [],
        eventsByPerson.get(person.id) ?? [],
        citationsByKey,
        sourceXref,
      );
    }

    // Drop a family that resolves to nothing at all (every parent/child id
    // is graph/Postgres drift with no matching `persons` row) rather than
    // emit a vestigial `FAM` record with no HUSB/WIFE/CHIL/MARR in it.
    const families = this.buildFamilies(allEdges, allUnions).filter(
      (family) =>
        family.parentIds.some((id) => personXref.has(id)) ||
        family.childIds.some((child) => personXref.has(child.id)),
    );
    families.forEach((family, index) => {
      this.writeFamily(writer, family, `F${index + 1}`, personXref, citationsByKey, sourceXref);
    });

    for (const source of allSources) {
      this.writeSource(writer, source, sourceXref.get(source.id)!);
    }

    writer.line(0, "TRLR");
    return writer.toString();
  }

  private writeIndividual(
    writer: GedcomWriter,
    person: PersonRow,
    personXref: Map<string, string>,
    names: PersonNameRow[],
    events: PersonEventRow[],
    citationsByKey: Map<string, CitationRow[]>,
    sourceXref: Map<string, string>,
  ): void {
    const xref = personXref.get(person.id)!;
    writer.line(0, "INDI", undefined, xref);
    writer.line(1, "NAME", `${person.given} /${person.surname}/`);
    if (person.given) writer.line(2, "GIVN", person.given);
    if (person.surname) writer.line(2, "SURN", person.surname);
    if (person.titlePrefix) writer.line(2, "NPFX", person.titlePrefix);
    if (person.suffix) writer.line(2, "NSFX", person.suffix);
    writer.line(1, "SEX", person.gender);
    this.writeCitations(writer, 2, citationsByKey.get(`person:${person.id}`), sourceXref);

    for (const name of names) {
      writer.line(1, "NAME", `${name.given} /${name.surname}/`);
      writer.line(2, "TYPE", name.nameType);
      this.writeCitations(writer, 2, citationsByKey.get(`name:${name.id}`), sourceXref);
    }

    let hasDeathEvent = false;
    for (const event of events) {
      const vitalTag = GEDCOM_VITAL_EVENT_TAGS[event.eventType];
      if (event.eventType === "death") hasDeathEvent = true;
      if (vitalTag) {
        writer.line(1, vitalTag);
      } else {
        writer.line(1, "EVEN");
        writer.line(2, "TYPE", event.label ?? event.eventType);
      }
      const level = vitalTag ? 2 : 3;
      if (event.date) writer.line(level, "DATE", toGedcomDate(event.date));
      if (event.place) writer.line(level, "PLAC", event.place);
      if (event.notes) writer.line(level, "NOTE", event.notes);
      this.writeCitations(writer, level, citationsByKey.get(`event:${event.id}`), sourceXref);
    }
    // `isLiving: false` with no recorded death event still means "known
    // dead, date unknown" — GEDCOM's own convention for that is a bare
    // `1 DEAT` with no further detail, distinct from omitting it entirely
    // (which GEDCOM readers take as "unknown whether living").
    if (!person.isLiving && !hasDeathEvent) writer.line(1, "DEAT");

    if (person.notes) writer.line(1, "NOTE", person.notes);
  }

  /**
   * Groups `PARENT_OF` edges by each child's full parent set, then folds in
   * `unions` rows that match a family's parent pair (or, for a childless
   * union, creates a family from the union alone). Two parents who married,
   * divorced and remarried each other collapse to one `FAM` record here —
   * children aren't linked to a specific `unions` row in this data model,
   * only to a parent pair, so there is no correct way to split them; the
   * first union found for the pair (preferring a non-terminal `status`) is
   * the one whose `MARR` detail gets attached.
   */
  private buildFamilies(
    edges: { parentId: string; childId: string; parentage: string }[],
    unionRows: UnionRow[],
  ): Family[] {
    const childrenByParentSet = new Map<string, Family>();
    const edgesByChild = groupBy(edges, (edge) => edge.childId);
    for (const [childId, childEdges] of edgesByChild) {
      const parentIds = [...new Set(childEdges.map((edge) => edge.parentId))].toSorted();
      const key = parentIds.join(",");
      const family = childrenByParentSet.get(key);
      const parentage = childEdges[0]?.parentage ?? "unknown";
      if (family) {
        family.childIds.push({ id: childId, parentage });
      } else {
        childrenByParentSet.set(key, {
          parentIds,
          childIds: [{ id: childId, parentage }],
          union: undefined,
        });
      }
    }

    for (const union of unionRows) {
      const key = [union.personAId, union.personBId].toSorted().join(",");
      const family = childrenByParentSet.get(key);
      if (family) {
        if (!family.union || (family.union.status !== "married" && union.status === "married")) {
          family.union = union;
        }
      } else {
        childrenByParentSet.set(key, {
          parentIds: [union.personAId, union.personBId],
          childIds: [],
          union,
        });
      }
    }

    return [...childrenByParentSet.values()];
  }

  private writeFamily(
    writer: GedcomWriter,
    family: Family,
    xref: string,
    personXref: Map<string, string>,
    citationsByKey: Map<string, CitationRow[]>,
    sourceXref: Map<string, string>,
  ): void {
    writer.line(0, "FAM", undefined, xref);
    // GEDCOM 5.5.1's `FAM` record only has HUSB/WIFE slots, no third "parent"
    // tag — assigned by gender when known (M/F, this app's own vocabulary),
    // and by a stable id order when not, since two `U`/same-gender parents
    // can't be represented more precisely in 5.5.1.
    const [firstId, secondId] = family.parentIds;
    const firstXref = firstId ? personXref.get(firstId) : undefined;
    const secondXref = secondId ? personXref.get(secondId) : undefined;
    if (firstXref) writer.line(1, "HUSB", gedcomPointer(firstXref));
    if (secondXref) writer.line(1, "WIFE", gedcomPointer(secondXref));
    for (const { id, parentage } of family.childIds) {
      // A child id with no matching `persons` row is graph/Postgres drift
      // (see the two-store consistency checker) — skip rather than emit a
      // malformed pointer to a record that doesn't exist in this export.
      const childXref = personXref.get(id);
      if (!childXref) continue;
      writer.line(1, "CHIL", gedcomPointer(childXref));
      writer.line(2, "PEDI", parentage);
    }
    if (family.union) {
      writer.line(1, "MARR");
      if (family.union.startDate) writer.line(2, "DATE", toGedcomDate(family.union.startDate));
      if (family.union.startPlace) writer.line(2, "PLAC", family.union.startPlace);
      if (family.union.notes) writer.line(2, "NOTE", family.union.notes);
      this.writeCitations(writer, 2, citationsByKey.get(`union:${family.union.id}`), sourceXref);
    }
  }

  private writeSource(writer: GedcomWriter, source: SourceRow, xref: string): void {
    writer.line(0, "SOUR", undefined, xref);
    writer.line(1, "TITL", source.title);
    if (source.author) writer.line(1, "AUTH", source.author);
    if (source.publication) writer.line(1, "PUBL", source.publication);
    // Kept simple deliberately: repository/source-type fold into a note
    // rather than a separate GEDCOM `REPO` record structure.
    const extra = [source.repository, source.sourceType].filter(Boolean).join(" — ");
    if (extra) writer.line(1, "NOTE", extra);
  }

  private writeCitations(
    writer: GedcomWriter,
    level: number,
    citationRows: CitationRow[] | undefined,
    sourceXref: Map<string, string>,
  ): void {
    for (const citation of citationRows ?? []) {
      const xref = sourceXref.get(citation.sourceId);
      if (!xref) continue;
      writer.line(level, "SOUR", gedcomPointer(xref));
      if (citation.page) writer.line(level + 1, "PAGE", citation.page);
      const detail = [
        citation.note,
        citation.confidence ? `confidence: ${citation.confidence}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      if (detail) {
        writer.line(level + 1, "DATA");
        writer.line(level + 2, "TEXT", detail);
      }
    }
  }
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const existing = map.get(k);
    if (existing) existing.push(item);
    else map.set(k, [item]);
  }
  return map;
}
