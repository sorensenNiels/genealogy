import {
  allPersonNodeIds,
  associations,
  citations,
  personEvents,
  personNames,
  persons,
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
  ) {}

  async checkData(): Promise<DataIntegrityReport> {
    // Possible duplicate people used to be listed here too, by exact name;
    // they're their own tool now (DuplicateService), which scores spelling
    // variants, dates and relatives instead.
    const [danglingCitations, danglingImmichLinks, recordAgeMismatches] = await Promise.all([
      this.findDanglingCitations(),
      // `isAvailable`, not `isConfigured`: with Immich down, every lookup
      // would throw and take the whole report with it.
      this.immich
        .isAvailable()
        .then((available) => (available ? this.immich.listDanglingLinks() : null)),
      this.records.ageMismatches(),
    ]);
    return { danglingCitations, danglingImmichLinks, recordAgeMismatches };
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
