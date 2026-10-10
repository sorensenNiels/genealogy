import {
  SEARCH_MATCH_END,
  SEARCH_MATCH_START,
  type HistoricalDate,
  type SearchHitKind,
} from "@genealogy/core";
import {
  associations,
  citations,
  personEvents,
  personNames,
  persons,
  personsWithVitals,
  recordPeople,
  records,
  researchNotes,
  SEARCHED_COLUMNS,
  searchDocument,
  searchQuery,
  searchVector,
  sources,
  unions,
  type Database,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

/** How many hits one search returns, best first — enough to scan, few enough to headline. */
const MAX_HITS = 100;

/** `ts_headline`'s options: up to two short fragments, matches wrapped in the private-use markers. */
const HEADLINE_OPTIONS = `StartSel=${SEARCH_MATCH_START}, StopSel=${SEARCH_MATCH_END}, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter=" … "`;

export interface SearchHit {
  kind: SearchHitKind;
  /** The matched row's own id. */
  id: string;
  snippet: string;
  /**
   * What the hit is about, by kind: an event/association/research-note/
   * name type key or a union status (labelled through `configurableOptions`
   * in the frontend), a citation's source title, a record's type.
   */
  context: string | null;
  person: {
    id: string;
    given: string;
    surname: string;
    birth: HistoricalDate | null;
    death: HistoricalDate | null;
  } | null;
  record: { id: string; recordType: string; date: HistoricalDate | null; place: string } | null;
}

export interface SearchResult {
  hits: SearchHit[];
  /** More matched than `MAX_HITS` — the search could be narrower. */
  truncated: boolean;
}

// A type alias, not an interface: `db.execute<T>` wants an index-signature-compatible row type.
export type RawHit = {
  kind: SearchHitKind;
  id: string;
  person_id: string | null;
  /** Anyone else the row is about (a union's partner, an association's associate) — it's hidden if either is. */
  other_person_id: string | null;
  record_id: string | null;
  context: string | null;
  snippet: string;
};

/**
 * Full-text search across the free text in the tree: person notes, name
 * and event notes, union and association notes, research notes, citations,
 * and records with the people in them. Names themselves aren't here — the
 * people list searches those. See `search.ts` in `@genealogy/db` for the
 * index and query rules, and "Full-text search" in TECH_STACK.md.
 *
 * Privacy is applied by the caller (the router), which drops every hit tied
 * to someone the viewer may only see by name — `hiddenIds` gets every
 * person id a hit touches.
 */
@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async search(input: string): Promise<{ raw: RawHit[]; truncated: boolean }> {
    const query = searchQuery(input);
    if (!query) return { raw: [], truncated: false };
    const tsQuery = sql`to_tsquery('simple', ${query})`;

    // One branch per searched table. Each `where` repeats the exact
    // expression its GIN index was built on (`SEARCHED_COLUMNS`), so the
    // index serves it; the document text is carried out for the headline.
    const branch = (
      kind: SearchHitKind,
      columns: SQLWrapper[],
      select: {
        id: SQLWrapper;
        personId: SQLWrapper | null;
        otherPersonId?: SQLWrapper;
        recordId?: SQLWrapper;
        context: SQLWrapper | null;
      },
      from: SQL,
    ) => {
      const vector = searchVector(...columns);
      return sql`select ${kind}::text as kind, ${select.id} as id,
          ${select.personId ?? sql`null::uuid`} as person_id,
          ${select.otherPersonId ?? sql`null::uuid`} as other_person_id,
          ${select.recordId ?? sql`null::uuid`} as record_id,
          ${select.context ?? sql`null::text`} as context,
          ${searchDocument(...columns)} as document,
          ts_rank(${vector}, ${tsQuery}) as rank
        ${from}
        where ${vector} @@ ${tsQuery}`;
    };

    const branches = [
      branch(
        "personNote",
        SEARCHED_COLUMNS.persons(persons),
        { id: persons.id, personId: persons.id, context: null },
        sql`from ${persons}`,
      ),
      branch(
        "name",
        SEARCHED_COLUMNS.personNames(personNames),
        { id: personNames.id, personId: personNames.personId, context: personNames.nameType },
        sql`from ${personNames}`,
      ),
      branch(
        "event",
        SEARCHED_COLUMNS.personEvents(personEvents),
        { id: personEvents.id, personId: personEvents.personId, context: personEvents.eventType },
        sql`from ${personEvents}`,
      ),
      branch(
        "union",
        SEARCHED_COLUMNS.unions(unions),
        {
          id: unions.id,
          personId: unions.personAId,
          otherPersonId: unions.personBId,
          context: unions.status,
        },
        sql`from ${unions}`,
      ),
      branch(
        "association",
        SEARCHED_COLUMNS.associations(associations),
        {
          id: associations.id,
          personId: associations.personId,
          otherPersonId: associations.associatePersonId,
          context: associations.role,
        },
        sql`from ${associations}`,
      ),
      branch(
        "researchNote",
        SEARCHED_COLUMNS.researchNotes(researchNotes),
        { id: researchNotes.id, personId: researchNotes.personId, context: researchNotes.noteType },
        sql`from ${researchNotes}`,
      ),
      branch(
        "citation",
        SEARCHED_COLUMNS.citations(citations),
        { id: citations.id, personId: citations.personId, context: sources.title },
        sql`from ${citations} join ${sources} on ${sources.id} = ${citations.sourceId}`,
      ),
      branch(
        "record",
        SEARCHED_COLUMNS.records(records),
        { id: records.id, personId: null, recordId: records.id, context: records.recordType },
        sql`from ${records}`,
      ),
      branch(
        "recordPerson",
        SEARCHED_COLUMNS.recordPeople(recordPeople),
        {
          id: recordPeople.id,
          personId: recordPeople.personId,
          recordId: recordPeople.recordId,
          context: records.recordType,
        },
        sql`from ${recordPeople} join ${records} on ${records.id} = ${recordPeople.recordId}`,
      ),
    ];

    // Rank and cut first, headline after: `ts_headline` re-parses the whole
    // document, so it's only worth running on the hits actually returned.
    const result = await this.db.execute<RawHit>(sql`
      select kind, id, person_id, other_person_id, record_id, context,
        ts_headline('simple', document, ${tsQuery}, ${HEADLINE_OPTIONS}) as snippet
      from (
        select * from (${sql.join(branches, sql` union all `)}) as matches
        order by rank desc, id
        limit ${MAX_HITS + 1}
      ) as top`);
    const raw = result.rows;
    return { raw: raw.slice(0, MAX_HITS), truncated: raw.length > MAX_HITS };
  }

  /** Every person id a hit touches — what the router asks the redactor about. */
  personIdsOf(raw: RawHit[]): string[] {
    return raw.flatMap((hit) =>
      [hit.person_id, hit.other_person_id].filter((id): id is string => id !== null),
    );
  }

  /** The visible hits, with the person and record each one links to. */
  async describe(raw: RawHit[], hidden: ReadonlySet<string>): Promise<SearchHit[]> {
    const visible = raw.filter(
      (hit) =>
        !(hit.person_id && hidden.has(hit.person_id)) &&
        !(hit.other_person_id && hidden.has(hit.other_person_id)),
    );
    const personIds = [
      ...new Set(visible.flatMap((hit) => (hit.person_id ? [hit.person_id] : []))),
    ];
    const recordIds = [
      ...new Set(visible.flatMap((hit) => (hit.record_id ? [hit.record_id] : []))),
    ];
    const [people, recordRows] = await Promise.all([
      personIds.length > 0 ? personsWithVitals(this.db).where(inArray(persons.id, personIds)) : [],
      recordIds.length > 0
        ? this.db
            .select({
              id: records.id,
              recordType: records.recordType,
              date: records.date,
              place: records.place,
            })
            .from(records)
            .where(inArray(records.id, recordIds))
        : [],
    ]);
    const personById = new Map(people.map((row) => [row.id, row]));
    const recordById = new Map(recordRows.map((row) => [row.id, row]));
    return visible.map((hit) => {
      const person = hit.person_id ? personById.get(hit.person_id) : undefined;
      return {
        kind: hit.kind,
        id: hit.id,
        snippet: hit.snippet,
        context: hit.context,
        person: person
          ? {
              id: person.id,
              given: person.given,
              surname: person.surname,
              birth: person.birth,
              death: person.death,
            }
          : null,
        record: (hit.record_id && recordById.get(hit.record_id)) || null,
      };
    });
  }
}
