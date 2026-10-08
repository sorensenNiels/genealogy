import {
  GEDCOM_EVENT_DETAIL_TAGS,
  GEDCOM_PEDIGREE_VALUES,
  GedcomWriter,
  gedcomEventTag,
  gedcomNameType,
  gedcomPointer,
  gedcom7NameType,
  gedcom7Role,
  gedcomDatePhrase,
  gedcomQuay,
  markdownToPlainText,
  toGedcomDate,
  type Gender,
  type GedcomVersion,
  type HistoricalDate,
} from "@genealogy/core";
import {
  allParentOfEdges,
  allSpouseOfEdges,
  associations,
  citations,
  configurableOptions,
  personEvents,
  personExternalIds,
  personNames,
  persons,
  places,
  repositories,
  researchNotes,
  sources,
  unions,
  type AssociationRow,
  type CitationRow,
  type Database,
  type PersonEventRow,
  type PersonExternalIdRow,
  type PersonNameRow,
  type PersonRow,
  type RepositoryRow,
  type ResearchNoteRow,
  type SourceRow,
  type UnionRow,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";

/** Every whole-tree lookup the per-record writers need, built once per export. */
interface ExportLookups {
  version: GedcomVersion;
  personXref: Map<string, string>;
  sourceXref: Map<string, string>;
  citationsByKey: Map<string, CitationRow[]>;
  eventTypeLabels: Map<string, string>;
  roleLabels: Map<string, string>;
  nameTypeLabels: Map<string, string>;
  repositoryXref: Map<string, string>;
  externalIdsByPerson: Map<string, PersonExternalIdRow[]>;
  /** Associations by their context: an event id, a union id, or (no context) the owner's person id. */
  associationsByEvent: Map<string, AssociationRow[]>;
  associationsByUnion: Map<string, AssociationRow[]>;
  associationsByPerson: Map<string, AssociationRow[]>;
  researchNotesByPerson: Map<string, ResearchNoteRow[]>;
  /** Place text → coordinates, from the `places` table. */
  placeCoordinates: Map<string, { x: number; y: number }>;
}

interface Family {
  xref: string;
  /** GEDCOM 5.5.1's two parent slots — see `assignParentSlots`. */
  husbandId: string | null;
  wifeId: string | null;
  /** Each child's parentage *per parent*, since a child can be one parent's by birth and the other's by marriage. */
  children: { id: string; parentage: Map<string, string> }[];
  union: UnionRow | undefined;
}

/**
 * Builds a GEDCOM 5.5.1 export of the whole tree in one pass — read-only, no
 * queue needed (unlike `BackupService`'s `pg_dump`, this is plain text, not a
 * large binary, so it's comfortably synchronous at this app's scale). See
 * "GEDCOM export" in TECH_STACK.md for the deliberate scope cuts (no `OBJE` —
 * photos aren't portable outside this app; no user notes — not part of
 * GEDCOM's model) and for which of this app's own fields travel as
 * underscore tags (`_STAT`, `_DETAIL`, `_TODO`, ...) that other programs
 * ignore but `GedcomImportService` reads back.
 */
/**
 * Notes are stored as markdown; other programs show a NOTE verbatim, so the
 * line itself carries plain text. When that loses anything (the note had
 * formatting), the markdown follows as this app's own `_MARKDOWN` child —
 * ignored elsewhere, preferred by `resolveNote` on import, so this app's own
 * round trip stays lossless.
 */
function writeDate(
  writer: GedcomWriter,
  level: number,
  tag: string,
  date: HistoricalDate,
  version: GedcomVersion,
): void {
  writer.line(level, tag, toGedcomDate(date, version));
  const phrase = gedcomDatePhrase(date, version);
  if (phrase) writer.line(level + 1, "PHRASE", phrase);
}

/**
 * This app's own extension tags, declared in a GEDCOM 7 header's SCHMA as 7
 * asks. The URI is a URN of this app's own rather than a web address, since
 * nothing is published there. Third-party tags this exporter also writes
 * (`_FSFTID`, `_APID`, `_FREL`/`_MREL`, `_TODO`) are deliberately left
 * undeclared — 7 allows undocumented extensions, and declaring them would
 * mean inventing URIs on other vendors' behalf.
 */
const APP_EXTENSION_TAGS = [
  "_STAT",
  "_END",
  "_DETAIL",
  "_DATE",
  "_VOLUME",
  "_ENTRY",
  "_CERT",
  "_TYPE",
  "_MARKDOWN",
];
const APP_EXTENSION_URN = "urn:x-genealogy-app:gedcom:";

function writeNote(writer: GedcomWriter, level: number, tag: string, markdown: string): void {
  const plain = markdownToPlainText(markdown);
  writer.line(level, tag, plain);
  if (plain !== markdown.trim()) writer.line(level + 1, "_MARKDOWN", markdown);
}

@Injectable()
export class GedcomService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * These reads run as separate, unsynchronized queries, not one consistent
   * snapshot — a person created (with its graph edges) between two of them
   * could transiently appear in one but not the other, dropped by the
   * "resolves to nothing" filters below rather than surfaced as a malformed
   * pointer. Judged an acceptable tradeoff at this app's scale (a single
   * family, low write concurrency) rather than wrapping the whole export in
   * one transaction for a vanishingly rare race.
   *
   * `submitterName` fills the SUBM record 5.5.1 requires — whoever is
   * signed in and exporting.
   */
  async exportAll(submitterName: string, version: GedcomVersion = "5.5.1"): Promise<string> {
    const [
      allPersons,
      allNames,
      allEvents,
      allUnions,
      allSources,
      allCitations,
      eventTypeOptions,
      roleOptions,
      allAssociations,
      allResearchNotes,
      allPlaces,
      allEdges,
      allSpouseEdges,
      allRepositories,
      allExternalIds,
      nameTypeOptions,
    ] = await Promise.all([
      this.db.select().from(persons),
      this.db.select().from(personNames),
      this.db.select().from(personEvents),
      this.db.select().from(unions),
      this.db.select().from(sources),
      this.db.select().from(citations),
      this.db
        .select({ key: configurableOptions.key, label: configurableOptions.label })
        .from(configurableOptions)
        .where(eq(configurableOptions.topic, "event_type")),
      this.db
        .select({ key: configurableOptions.key, label: configurableOptions.label })
        .from(configurableOptions)
        .where(eq(configurableOptions.topic, "association_role")),
      this.db.select().from(associations),
      this.db.select().from(researchNotes),
      this.loadPlaces(),
      allParentOfEdges(this.pool),
      allSpouseOfEdges(this.pool),
      this.db.select().from(repositories),
      this.db.select().from(personExternalIds),
      this.db
        .select({ key: configurableOptions.key, label: configurableOptions.label })
        .from(configurableOptions)
        .where(eq(configurableOptions.topic, "name_variant_type")),
    ]);

    const writer = new GedcomWriter(version);
    const today = new Date().toISOString().slice(0, 10);
    writer.line(0, "HEAD");
    if (version === "7.0") {
      // 7.0: GEDC first, no FORM or CHAR (a GEDCOM 7 file is always UTF-8),
      // and this app's extension tags declared in SCHMA.
      writer.line(1, "GEDC");
      writer.line(2, "VERS", "7.0");
      writer.line(1, "SCHMA");
      for (const tag of APP_EXTENSION_TAGS) {
        writer.line(2, "TAG", `${tag} ${APP_EXTENSION_URN}${tag.slice(1)}`);
      }
    }
    writer.line(1, "SOUR", "genealogy-app");
    writer.line(1, "DATE", toGedcomDate({ original: today, earliest: today, latest: today }));
    writer.line(1, "SUBM", gedcomPointer("U1"));
    if (version === "5.5.1") {
      writer.line(1, "GEDC");
      writer.line(2, "VERS", "5.5.1");
      writer.line(2, "FORM", "LINEAGE-LINKED");
      writer.line(1, "CHAR", "UTF-8");
    }
    writer.line(0, "SUBM", undefined, "U1");
    writer.line(1, "NAME", submitterName || "Unknown");

    const personXref = new Map<string, string>();
    allPersons.forEach((person, index) => personXref.set(person.id, `I${index + 1}`));
    const genderById = new Map(allPersons.map((person) => [person.id, person.gender]));

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
    const repositoryXref = new Map<string, string>();
    allRepositories.forEach((repo, index) => repositoryXref.set(repo.id, `R${index + 1}`));

    const families = this.buildFamilies(
      allEdges,
      allUnions,
      allSpouseEdges,
      genderById,
      personXref,
    );
    const familiesAsChild = new Map<string, Family[]>();
    const familiesAsSpouse = new Map<string, Family[]>();
    for (const family of families) {
      for (const child of family.children) push(familiesAsChild, child.id, family);
      for (const id of [family.husbandId, family.wifeId])
        if (id) push(familiesAsSpouse, id, family);
    }

    const lookups: ExportLookups = {
      version,
      personXref,
      sourceXref,
      citationsByKey,
      eventTypeLabels: new Map(eventTypeOptions.map((option) => [option.key, option.label])),
      roleLabels: new Map(roleOptions.map((option) => [option.key, option.label])),
      nameTypeLabels: new Map(nameTypeOptions.map((option) => [option.key, option.label])),
      repositoryXref,
      externalIdsByPerson: groupBy(allExternalIds, (row) => row.personId),
      associationsByEvent: groupBy(
        allAssociations.filter((row) => row.eventId),
        (row) => row.eventId!,
      ),
      associationsByUnion: groupBy(
        allAssociations.filter((row) => row.unionId),
        (row) => row.unionId!,
      ),
      associationsByPerson: groupBy(
        allAssociations.filter((row) => !row.eventId && !row.unionId),
        (row) => row.personId,
      ),
      researchNotesByPerson: groupBy(allResearchNotes, (row) => row.personId),
      placeCoordinates: new Map(allPlaces.map((place) => [place.name, place.location])),
    };
    for (const person of allPersons) {
      this.writeIndividual(
        writer,
        person,
        {
          names: namesByPerson.get(person.id) ?? [],
          events: eventsByPerson.get(person.id) ?? [],
          familiesAsChild: familiesAsChild.get(person.id) ?? [],
          familiesAsSpouse: familiesAsSpouse.get(person.id) ?? [],
        },
        lookups,
      );
    }

    for (const family of families) {
      this.writeFamily(writer, family, lookups);
    }

    for (const source of allSources) {
      this.writeSource(writer, source, sourceXref.get(source.id)!, lookups);
    }
    for (const repo of allRepositories) {
      this.writeRepository(writer, repo, repositoryXref.get(repo.id)!);
    }

    writer.line(0, "TRLR");
    return writer.toString();
  }

  /**
   * Every row of `places`, or none if the table doesn't exist yet — it's
   * created by the PostGIS migration, which fails on a server without the
   * PostGIS packages (see 0033_places_postgis.sql). Export worked before
   * places existed and must keep working on such a database.
   */
  private async loadPlaces(): Promise<{ name: string; location: { x: number; y: number } }[]> {
    const exists = await this.db.execute<{ table: string | null }>(
      sql`select to_regclass('public.places')::text as table`,
    );
    if (!exists.rows[0]?.table) return [];
    return this.db.select({ name: places.name, location: places.location }).from(places);
  }

  /** `3 MAP / 4 LATI N55.94 / 4 LONG E9.13` under a PLAC at `level`, when the place has coordinates. */
  private writeCoordinates(
    writer: GedcomWriter,
    level: number,
    place: string,
    lookups: ExportLookups,
  ): void {
    const location = lookups.placeCoordinates.get(place);
    if (!location) return;
    writer.line(level + 1, "MAP");
    writer.line(level + 2, "LATI", gedcomCoordinate(location.y, "N", "S"));
    writer.line(level + 2, "LONG", gedcomCoordinate(location.x, "E", "W"));
  }

  /**
   * GEDCOM `ASSO` for someone in the tree; this app's own `_ASSO <name>`
   * for a name-only associate (5.5.1's ASSO must point at a record). RELA
   * carries the role's label — or an "other" role's own label — which the
   * importer matches back on key or label.
   */
  private writeAssociations(
    writer: GedcomWriter,
    level: number,
    rows: AssociationRow[] | undefined,
    lookups: ExportLookups,
  ): void {
    const isSeven = lookups.version === "7.0";
    for (const row of rows ?? []) {
      if (row.associatePersonId) {
        const xref = lookups.personXref.get(row.associatePersonId);
        if (!xref) continue;
        writer.line(level, "ASSO", gedcomPointer(xref));
      } else if (row.associateName) {
        // 7.0 has a standard form for "someone not in the file": @VOID@ + PHRASE.
        if (isSeven) {
          writer.line(level, "ASSO", "@VOID@");
          writer.line(level + 1, "PHRASE", row.associateName);
        } else {
          writer.line(level, "_ASSO", row.associateName);
        }
      } else {
        continue;
      }
      const roleLabel =
        row.role === "other"
          ? (row.label ?? "Other")
          : (lookups.roleLabels.get(row.role) ?? row.role);
      if (isSeven) {
        const { role, phrase } = gedcom7Role(row.role, roleLabel);
        writer.line(level + 1, "ROLE", role);
        if (phrase) writer.line(level + 2, "PHRASE", phrase);
      } else {
        writer.line(level + 1, "RELA", roleLabel);
      }
      if (row.notes) writeNote(writer, level + 1, "NOTE", row.notes);
      this.writeCitations(
        writer,
        level + 1,
        lookups.citationsByKey.get(`association:${row.id}`),
        lookups.sourceXref,
      );
    }
  }

  private writeIndividual(
    writer: GedcomWriter,
    person: PersonRow,
    context: {
      names: PersonNameRow[];
      events: PersonEventRow[];
      familiesAsChild: Family[];
      familiesAsSpouse: Family[];
    },
    lookups: ExportLookups,
  ): void {
    const { citationsByKey, sourceXref, version } = lookups;
    const isSeven = version === "7.0";
    writer.line(0, "INDI", undefined, lookups.personXref.get(person.id)!);
    if (person.restriction) {
      writer.line(1, "RESN", isSeven ? person.restriction.toUpperCase() : person.restriction);
    }
    writer.line(1, "NAME", `${person.given} /${person.surname}/`);
    if (person.given) writer.line(2, "GIVN", person.given);
    if (person.surname) writer.line(2, "SURN", person.surname);
    if (person.titlePrefix) writer.line(2, "NPFX", person.titlePrefix);
    if (person.suffix) writer.line(2, "NSFX", person.suffix);
    writer.line(1, "SEX", person.gender);
    this.writeCitations(writer, 2, citationsByKey.get(`person:${person.id}`), sourceXref);

    for (const name of context.names) {
      writer.line(1, "NAME", `${name.given} /${name.surname}/`);
      if (name.given) writer.line(2, "GIVN", name.given);
      if (name.surname) writer.line(2, "SURN", name.surname);
      if (isSeven) {
        const { type, phrase } = gedcom7NameType(
          name.nameType,
          lookups.nameTypeLabels.get(name.nameType) ?? name.nameType,
        );
        writer.line(2, "TYPE", type);
        if (phrase) writer.line(3, "PHRASE", phrase);
      } else {
        writer.line(2, "TYPE", gedcomNameType(name.nameType));
      }
      // GEDCOM's NAME structure has no date; `_DATE` keeps "known by this
      // name since" for this app's own importer.
      if (name.since) writeDate(writer, 2, "_DATE", name.since, version);
      if (name.notes) writeNote(writer, 2, "NOTE", name.notes);
      this.writeCitations(writer, 2, citationsByKey.get(`name:${name.id}`), sourceXref);
    }

    let hasDeathEvent = false;
    for (const event of context.events) {
      if (event.eventType === "death") hasDeathEvent = true;
      this.writeEvent(writer, event, lookups);
      this.writeCitations(writer, 2, citationsByKey.get(`event:${event.id}`), sourceXref);
      // ASSO under an event is GEDCOM 7's form and what Gramps/RootsMagic
      // write; 5.5.1 only defines it under INDI, which is where roles with
      // no event go below.
      this.writeAssociations(writer, 2, lookups.associationsByEvent.get(event.id), lookups);
    }
    // `isLiving: false` with no recorded death event still means "known
    // dead, date unknown" — GEDCOM's own convention for that is a bare
    // `1 DEAT` with no further detail, distinct from omitting it entirely
    // (which GEDCOM readers take as "unknown whether living").
    // (7.0 spells that "it happened, no details" as the payload Y.)
    if (!person.isLiving && !hasDeathEvent) writer.line(1, "DEAT", isSeven ? "Y" : undefined);

    // The INDI → FAM back-links 5.5.1 expects alongside FAM's own
    // HUSB/WIFE/CHIL — several programs build their family view from these.
    for (const family of context.familiesAsChild) {
      writer.line(1, "FAMC", gedcomPointer(family.xref));
      const pedigree = sharedPedigree(family, person.id);
      if (pedigree) writer.line(2, "PEDI", isSeven ? pedigree.toUpperCase() : pedigree);
    }
    for (const family of context.familiesAsSpouse) {
      writer.line(1, "FAMS", gedcomPointer(family.xref));
    }

    this.writeAssociations(writer, 1, lookups.associationsByPerson.get(person.id), lookups);
    this.writeExternalIds(writer, lookups.externalIdsByPerson.get(person.id), version);

    // Research notes as the `_TODO` Legacy and RootsMagic use for research
    // tasks — TYPE carries the note type, `_STAT DONE` a resolved one.
    for (const note of lookups.researchNotesByPerson.get(person.id) ?? []) {
      writeNote(writer, 1, "_TODO", note.body);
      writer.line(2, "TYPE", note.noteType);
      if (note.resolved) writer.line(2, "_STAT", "DONE");
    }

    if (person.notes) writeNote(writer, 1, "NOTE", person.notes);
  }

  /**
   * An event as its own GEDCOM tag where one exists (`CHR`, `OCCU`,
   * `RESI`, ...), else `EVEN` + `TYPE` with the option's label (or an
   * "other" event's own label). `details` go out as the standard sub-tag
   * where GEDCOM has one (`OCCU`'s value, `CAUS`, `ADDR`, `AGNC`) and as
   * `_DETAIL` otherwise.
   */
  private writeEvent(writer: GedcomWriter, event: PersonEventRow, lookups: ExportLookups): void {
    const mapped = gedcomEventTag(event.eventType);
    const details = { ...event.details };
    let value: string | undefined;
    if (mapped?.valueDetail) {
      value = details[mapped.valueDetail];
      delete details[mapped.valueDetail];
    }
    const hasDetail = !!(value || event.date || event.place);
    // 7.0: a known event with nothing else to say carries the payload Y.
    writer.line(
      1,
      mapped?.tag ?? "EVEN",
      value ?? (lookups.version === "7.0" && mapped && !hasDetail ? "Y" : undefined),
    );
    if (!mapped) {
      writer.line(
        2,
        "TYPE",
        event.eventType === "other"
          ? (event.label ?? "Other")
          : (lookups.eventTypeLabels.get(event.eventType) ?? event.eventType),
      );
    }
    if (event.date) writeDate(writer, 2, "DATE", event.date, lookups.version);
    if (event.place) {
      writer.line(2, "PLAC", event.place);
      this.writeCoordinates(writer, 2, event.place, lookups);
    }
    const detailTags = GEDCOM_EVENT_DETAIL_TAGS[event.eventType] ?? {};
    for (const [key, detailValue] of Object.entries(details)) {
      if (!detailValue) continue;
      const tag = detailTags[key];
      if (tag) {
        writer.line(2, tag, detailValue);
      } else {
        writer.line(2, "_DETAIL", detailValue);
        writer.line(3, "TYPE", key);
      }
    }
    if (event.notes) writeNote(writer, 2, "NOTE", event.notes);
  }

  /**
   * Turns `PARENT_OF` edges, `unions` rows and `SPOUSE_OF` edges into FAM
   * records:
   *
   * - A child's parents (up to two) form one family, each parent's
   *   parentage kept separately. A child with more than two parents (birth
   *   *and* adoptive parents, say) can't fit 5.5.1's two slots, so their
   *   parents are split by parentage into one family per pair.
   * - Each `unions` row is a family: the first (by start date) for a pair
   *   joins the family their shared children are in, any later one — a
   *   couple who divorced and remarried — becomes its own childless FAM, so
   *   both marriages' details survive. Children aren't linked to a specific
   *   union in this data model, so they stay with the first.
   * - A `SPOUSE_OF` edge with no union and no shared children still gets a
   *   (bare HUSB/WIFE) family, or the couple would vanish from the export.
   *
   * Ids with no `persons` row (graph/Postgres drift — see the two-store
   * consistency checker) are left out, and a family left with nobody in it
   * at all is dropped rather than written as an empty record.
   */
  private buildFamilies(
    edges: { parentId: string; childId: string; parentage: string }[],
    unionRows: UnionRow[],
    spouseEdges: { aId: string; bId: string }[],
    genderById: Map<string, Gender>,
    personXref: Map<string, string>,
  ): Family[] {
    const known = (id: string): boolean => personXref.has(id);
    const byParents = new Map<
      string,
      Omit<Family, "xref" | "husbandId" | "wifeId"> & { parentIds: string[] }
    >();
    const extra: (Omit<Family, "xref" | "husbandId" | "wifeId"> & { parentIds: string[] })[] = [];
    const familyFor = (parentIds: string[]) => {
      const key = parentIds.toSorted().join(",");
      let family = byParents.get(key);
      if (!family) {
        family = { parentIds: parentIds.toSorted(), children: [], union: undefined };
        byParents.set(key, family);
      }
      return family;
    };

    for (const [childId, childEdges] of groupBy(edges, (edge) => edge.childId)) {
      if (!known(childId)) continue;
      const parentEdges = childEdges.filter((edge) => known(edge.parentId));
      const groups =
        parentEdges.length <= 2
          ? [parentEdges]
          : [...groupBy(parentEdges, (edge) => edge.parentage).values()].flatMap((group) =>
              chunk(group, 2),
            );
      for (const group of groups) {
        if (group.length === 0) continue;
        familyFor(group.map((edge) => edge.parentId)).children.push({
          id: childId,
          parentage: new Map(group.map((edge) => [edge.parentId, edge.parentage])),
        });
      }
    }

    const byStart = unionRows.toSorted((a, b) =>
      (a.startDate?.earliest ?? "9999").localeCompare(b.startDate?.earliest ?? "9999"),
    );
    for (const union of byStart) {
      const pair = [union.personAId, union.personBId].filter(known);
      if (pair.length === 0) continue;
      const family = familyFor(pair);
      if (family.union) extra.push({ parentIds: family.parentIds, children: [], union });
      else family.union = union;
    }

    for (const { aId, bId } of spouseEdges) {
      if (known(aId) && known(bId)) familyFor([aId, bId]);
    }

    return [...byParents.values(), ...extra].map((family, index) => {
      const { husbandId, wifeId } = assignParentSlots(family.parentIds, genderById);
      return {
        xref: `F${index + 1}`,
        husbandId,
        wifeId,
        children: family.children,
        union: family.union,
      };
    });
  }

  private writeFamily(writer: GedcomWriter, family: Family, lookups: ExportLookups): void {
    const { personXref, citationsByKey, sourceXref } = lookups;
    writer.line(0, "FAM", undefined, family.xref);
    if (family.husbandId) writer.line(1, "HUSB", gedcomPointer(personXref.get(family.husbandId)!));
    if (family.wifeId) writer.line(1, "WIFE", gedcomPointer(personXref.get(family.wifeId)!));
    for (const child of family.children) {
      writer.line(1, "CHIL", gedcomPointer(personXref.get(child.id)!));
      // The standard place for parentage is the child's own `FAMC.PEDI`
      // (see `writeIndividual`), which only fits when both parents share one
      // of 5.5.1's four values. Otherwise — a stepfather, a parentage this
      // app's Settings added — each parent's goes here as Ancestry/FTM's
      // `_FREL`/`_MREL` (HUSB/WIFE slot respectively), which importers
      // including this app's own already read.
      if (!sharedPedigree(family, child.id)) {
        const father = family.husbandId ? child.parentage.get(family.husbandId) : undefined;
        const mother = family.wifeId ? child.parentage.get(family.wifeId) : undefined;
        if (father) writer.line(2, "_FREL", father);
        if (mother) writer.line(2, "_MREL", mother);
      }
    }

    const union = family.union;
    if (!union) return;
    // Status only as this app's own `_STAT` when the events below don't
    // already say it — `MARR` alone reads as married, `DIV` as divorced.
    if (union.status !== "married" && union.status !== "divorced" && union.status !== "annulled") {
      writer.line(1, "_STAT", union.status);
    }
    const isSeven = lookups.version === "7.0";
    writer.line(1, "MARR", isSeven && !union.startDate && !union.startPlace ? "Y" : undefined);
    if (union.startDate) writeDate(writer, 2, "DATE", union.startDate, lookups.version);
    if (union.startPlace) {
      writer.line(2, "PLAC", union.startPlace);
      this.writeCoordinates(writer, 2, union.startPlace, lookups);
    }
    if (union.notes) writeNote(writer, 2, "NOTE", union.notes);
    this.writeCitations(writer, 2, citationsByKey.get(`union:${union.id}`), sourceXref);
    // Marriage witnesses, under the MARR they witnessed.
    this.writeAssociations(writer, 2, lookups.associationsByUnion.get(union.id), lookups);
    const isEnded = union.status === "divorced" || union.status === "annulled";
    if (isEnded || union.endDate || union.endPlace) {
      // DIV/ANUL are 5.5.1's; any other ending (a spouse's death,
      // separation) has no standard tag and goes out as `_END`.
      const tag =
        union.status === "annulled" ? "ANUL" : union.status === "divorced" ? "DIV" : "_END";
      writer.line(1, tag, isSeven && !union.endDate && !union.endPlace ? "Y" : undefined);
      if (union.endDate) writeDate(writer, 2, "DATE", union.endDate, lookups.version);
      if (union.endPlace) {
        writer.line(2, "PLAC", union.endPlace);
        this.writeCoordinates(writer, 2, union.endPlace, lookups);
      }
    }
  }

  private writeSource(
    writer: GedcomWriter,
    source: SourceRow,
    xref: string,
    lookups: ExportLookups,
  ): void {
    writer.line(0, "SOUR", undefined, xref);
    writer.line(1, "TITL", source.title);
    if (source.author) writer.line(1, "AUTH", source.author);
    if (source.publication) writer.line(1, "PUBL", source.publication);
    const repoXref = source.repositoryId ? lookups.repositoryXref.get(source.repositoryId) : null;
    if (repoXref) {
      writer.line(1, "REPO", gedcomPointer(repoXref));
      if (source.callNumber) writer.line(2, "CALN", source.callNumber);
    }
    // Free text ("parish register", "1920 census") — no 5.5.1 field fits;
    // `REPO.CALN.MEDI` is a fixed media vocabulary and needs a call number.
    if (source.sourceType) writer.line(1, "_TYPE", source.sourceType);
  }

  private writeRepository(writer: GedcomWriter, repo: RepositoryRow, xref: string): void {
    writer.line(0, "REPO", undefined, xref);
    writer.line(1, "NAME", repo.name);
    if (repo.address) writer.line(1, "ADDR", repo.address);
    if (repo.phone) writer.line(1, "PHON", repo.phone);
    if (repo.email) writer.line(1, "EMAIL", repo.email);
    if (repo.website) writer.line(1, "WWW", repo.website);
  }

  /**
   * FamilySearch as `_FSFTID` (what FamilySearch itself and most programs
   * write) unless it arrived as a GEDCOM 7 EXID with a TYPE, which then goes
   * back out the same way; Ancestry as `_APID`; REFN as REFN. A generic id is
   * an EXID in 7.0 — 5.5.1 has no EXID, so it's this app's own `_EXID` there.
   */
  private writeExternalIds(
    writer: GedcomWriter,
    rows: PersonExternalIdRow[] | undefined,
    version: GedcomVersion,
  ): void {
    for (const row of rows ?? []) {
      let tag: string;
      if (row.system === "familysearch") tag = version === "7.0" && row.type ? "EXID" : "_FSFTID";
      else if (row.system === "ancestry") tag = "_APID";
      else if (row.system === "refn") tag = "REFN";
      else tag = version === "7.0" ? "EXID" : "_EXID";
      writer.line(1, tag, row.value);
      if (row.type && tag !== "_FSFTID" && tag !== "_APID") writer.line(2, "TYPE", row.type);
    }
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
      // No 5.5.1 equivalents — this app's own tags, read back on import.
      if (citation.volume) writer.line(level + 1, "_VOLUME", citation.volume);
      if (citation.entryId) writer.line(level + 1, "_ENTRY", citation.entryId);
      if (citation.certificateNumber) {
        writer.line(level + 1, "_CERT", citation.certificateNumber);
      }
      if (citation.ancestryApid) writer.line(level + 1, "_APID", citation.ancestryApid);
      // The four seeded confidence levels are QUAY 0–3; a level added in
      // Settings has no QUAY equivalent and is folded into the text instead
      // (the importer reads that suffix back).
      const quay = gedcomQuay(citation.confidence);
      const detail = [citation.note, quay ? null : `confidence: ${citation.confidence}`]
        .filter(Boolean)
        .join(" — ");
      if (detail) {
        writer.line(level + 1, "DATA");
        writer.line(level + 2, "TEXT", detail);
      }
      if (quay) writer.line(level + 1, "QUAY", quay);
    }
  }
}

/**
 * GEDCOM 5.5.1's FAM has only HUSB/WIFE slots. Gender decides where it can
 * (a lone mother goes in WIFE, not HUSB); two `U`/same-gender parents keep
 * their stable id order, since 5.5.1 can't represent them more precisely.
 */
function assignParentSlots(
  parentIds: string[],
  genderById: Map<string, Gender>,
): { husbandId: string | null; wifeId: string | null } {
  const [first, second] = parentIds;
  if (!first) return { husbandId: null, wifeId: null };
  if (!second) {
    return genderById.get(first) === "F"
      ? { husbandId: null, wifeId: first }
      : { husbandId: first, wifeId: null };
  }
  const firstGender = genderById.get(first);
  const secondGender = genderById.get(second);
  const swap =
    (firstGender === "F" && secondGender !== "F") || (secondGender === "M" && firstGender !== "M");
  return swap ? { husbandId: second, wifeId: first } : { husbandId: first, wifeId: second };
}

/** GEDCOM 5.5.1's coordinate form: hemisphere letter + decimal degrees, at most 6 places (~0.1 m). */
function gedcomCoordinate(value: number, positive: string, negative: string): string {
  return `${value < 0 ? negative : positive}${Number(Math.abs(value).toFixed(6))}`;
}

/** The child's parentage when every parent in this family shares one valid `PEDI` value — else `null`, and `_FREL`/`_MREL` carry it. */
function sharedPedigree(family: Family, childId: string): string | null {
  const child = family.children.find((entry) => entry.id === childId);
  if (!child) return null;
  const values = new Set(child.parentage.values());
  const [only] = values;
  return values.size === 1 && only && GEDCOM_PEDIGREE_VALUES.has(only) ? only : null;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) push(map, key(item), item);
  return map;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}
