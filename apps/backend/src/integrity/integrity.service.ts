import {
  consistencyIssues,
  isBirthParentage,
  type ConsistencyIssue,
  type ConsistencyPerson,
  type HistoricalDate,
} from "@genealogy/core";
import {
  allParentOfEdges,
  allPersonNodeIds,
  associations,
  citations,
  personEvents,
  personNames,
  persons,
  personsWithVitals,
  sources,
  unions,
  type Database,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";
import { ImmichService } from "../immich/immich.service.js";
import { RecordService, type RecordAgeMismatch } from "../records/record.service.js";
import { SettingsService } from "../settings/settings.service.js";

/** One person's consistency warnings — facts about them and their parents that can't all be true. */
export interface PersonConsistencyIssues {
  person: { id: string; given: string; surname: string };
  issues: ConsistencyIssue[];
}

export interface DanglingCitation {
  citationId: string;
  personId: string;
  personGiven: string;
  personSurname: string;
  factType: string;
  sourceTitle: string;
}

export interface DanglingImmichLink {
  linkId: string;
  personId: string;
  personGiven: string;
  personSurname: string;
  immichPersonId: string;
}

export interface DataIntegrityReport {
  danglingCitations: DanglingCitation[];
  /** Null (not just empty) when Immich isn't available — nothing to check against. */
  danglingImmichLinks: DanglingImmichLink[] | null;
  /** People whose age in a record disagrees with their recorded birth by more than a couple of years. */
  recordAgeMismatches: RecordAgeMismatch[];
  /** Facts that can't all be true (`consistencyIssues`), per person, under Settings → Person page's limits. */
  consistencyIssues: PersonConsistencyIssues[];
}

export interface GraphConsistencyReport {
  /** In Postgres, with no matching graph node. */
  personsMissingGraphNode: { id: string; given: string; surname: string }[];
  /** In the graph, with no matching `persons` row. */
  orphanedGraphNodes: string[];
}

/**
 * Read-only "find problems" reports for the Tools page — no auto-fix in
 * this first pass (see the plan this was built from): an admin judges each
 * finding, nothing here mutates data.
 */
@Injectable()
export class IntegrityService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly immich: ImmichService,
    private readonly records: RecordService,
    private readonly settings: SettingsService,
  ) {}

  async checkData(): Promise<DataIntegrityReport> {
    // Possible duplicate people used to be listed here too, by exact name;
    // they're their own tool now (DuplicateService), which scores spelling
    // variants, dates and relatives instead.
    const [danglingCitations, danglingImmichLinks, recordAgeMismatches, consistency] =
      await Promise.all([
        this.findDanglingCitations(),
        // `isAvailable`, not `isConfigured`: with Immich down, every lookup
        // would throw and take the whole report with it.
        this.immich
          .isAvailable()
          .then((available) => (available ? this.immich.listDanglingLinks() : null)),
        this.records.ageMismatches(),
        this.findConsistencyIssues(),
      ]);
    return {
      danglingCitations,
      danglingImmichLinks,
      recordAgeMismatches,
      consistencyIssues: consistency,
    };
  }

  /**
   * The consistency rules over the whole tree, in a handful of bulk reads.
   * Each person is checked against their own facts and their birth parents
   * — not their children too, which would report every parent/child pair
   * twice (the person page shows both sides).
   */
  async findConsistencyIssues(): Promise<PersonConsistencyIssues[]> {
    const [settings, people, events, unionRows, parentEdges] = await Promise.all([
      this.settings.getPersonSettings(),
      personsWithVitals(this.db),
      this.db
        .select({
          personId: personEvents.personId,
          eventType: personEvents.eventType,
          date: personEvents.date,
        })
        .from(personEvents),
      this.db
        .select({
          personAId: unions.personAId,
          personBId: unions.personBId,
          startDate: unions.startDate,
        })
        .from(unions),
      allParentOfEdges(this.pool),
    ]);
    const byId = new Map<string, ConsistencyPerson>(people.map((person) => [person.id, person]));
    const eventsOf = new Map<string, { eventType: string; date: HistoricalDate | null }[]>();
    for (const event of events) {
      const list = eventsOf.get(event.personId) ?? [];
      list.push(event);
      eventsOf.set(event.personId, list);
    }
    const unionsOf = new Map<string, { startDate: HistoricalDate | null; partnerId: string }[]>();
    for (const union of unionRows) {
      for (const [self, partner] of [
        [union.personAId, union.personBId],
        [union.personBId, union.personAId],
      ] as const) {
        const list = unionsOf.get(self) ?? [];
        list.push({ startDate: union.startDate, partnerId: partner });
        unionsOf.set(self, list);
      }
    }
    const parentsOf = new Map<string, ConsistencyPerson[]>();
    for (const edge of parentEdges) {
      const parent = byId.get(edge.parentId);
      if (!parent || !isBirthParentage(edge.parentage)) continue;
      const list = parentsOf.get(edge.childId) ?? [];
      list.push(parent);
      parentsOf.set(edge.childId, list);
    }

    return people.flatMap((person) => {
      const issues = consistencyIssues(
        {
          person,
          events: eventsOf.get(person.id) ?? [],
          unions: (unionsOf.get(person.id) ?? []).map((union) => ({
            startDate: union.startDate,
            partner: byId.get(union.partnerId) ?? null,
          })),
          parents: parentsOf.get(person.id) ?? [],
          children: [],
        },
        settings,
      );
      return issues.length > 0
        ? [{ person: { id: person.id, given: person.given, surname: person.surname }, issues }]
        : [];
    });
  }

  async checkGraphConsistency(): Promise<GraphConsistencyReport> {
    const [allPersons, graphIds] = await Promise.all([
      this.db
        .select({ id: persons.id, given: persons.given, surname: persons.surname })
        .from(persons),
      allPersonNodeIds(this.pool),
    ]);
    const personIds = new Set(allPersons.map((person) => person.id));
    const graphIdSet = new Set(graphIds);
    return {
      personsMissingGraphNode: allPersons.filter((person) => !graphIdSet.has(person.id)),
      orphanedGraphNodes: graphIds.filter((id) => !personIds.has(id)),
    };
  }

  /**
   * The schema comment on `citations` says the app is responsible for
   * clearing a citation when its `factId` row (a `personNames`/
   * `personEvents`/`unions` row) is deleted — there's no DB cascade
   * possible on a polymorphic `factId`. This is the check that makes any
   * place that misses that cleanup visible. Three separate queries, one per
   * `factType`, rather than one query across all three: `factId` only ever
   * means something against the one table matching its own `factType`, so
   * joining each type against its own table (not all three at once) is both
   * simpler and correct.
   */
  private async findDanglingCitations(): Promise<DanglingCitation[]> {
    const selection = {
      citationId: citations.id,
      personId: citations.personId,
      personGiven: persons.given,
      personSurname: persons.surname,
      sourceTitle: sources.title,
    };
    const [danglingNames, danglingEvents, danglingUnions, danglingAssociations] = await Promise.all(
      [
        this.db
          .select(selection)
          .from(citations)
          .innerJoin(sources, eq(citations.sourceId, sources.id))
          .innerJoin(persons, eq(citations.personId, persons.id))
          .leftJoin(personNames, eq(citations.factId, personNames.id))
          .where(and(eq(citations.factType, "name"), isNull(personNames.id))),
        this.db
          .select(selection)
          .from(citations)
          .innerJoin(sources, eq(citations.sourceId, sources.id))
          .innerJoin(persons, eq(citations.personId, persons.id))
          .leftJoin(personEvents, eq(citations.factId, personEvents.id))
          .where(and(eq(citations.factType, "event"), isNull(personEvents.id))),
        this.db
          .select(selection)
          .from(citations)
          .innerJoin(sources, eq(citations.sourceId, sources.id))
          .innerJoin(persons, eq(citations.personId, persons.id))
          .leftJoin(unions, eq(citations.factId, unions.id))
          .where(and(eq(citations.factType, "union"), isNull(unions.id))),
        this.db
          .select(selection)
          .from(citations)
          .innerJoin(sources, eq(citations.sourceId, sources.id))
          .innerJoin(persons, eq(citations.personId, persons.id))
          .leftJoin(associations, eq(citations.factId, associations.id))
          .where(and(eq(citations.factType, "association"), isNull(associations.id))),
      ],
    );
    return [
      ...danglingNames.map((row) => Object.assign(row, { factType: "name" })),
      ...danglingEvents.map((row) => Object.assign(row, { factType: "event" })),
      ...danglingUnions.map((row) => Object.assign(row, { factType: "union" })),
      ...danglingAssociations.map((row) => Object.assign(row, { factType: "association" })),
    ];
  }
}
