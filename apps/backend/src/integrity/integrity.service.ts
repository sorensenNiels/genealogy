import {
  allPersonNodeIds,
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

export interface DanglingCitation {
  citationId: string;
  personId: string;
  personGiven: string;
  personSurname: string;
  factType: string;
  sourceTitle: string;
}

export interface DuplicatePersonGroup {
  given: string;
  surname: string;
  people: { id: string; given: string; surname: string }[];
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
  possibleDuplicates: DuplicatePersonGroup[];
  /** Omitted entirely (not just empty) when Immich isn't configured — there's nothing to check. */
  danglingImmichLinks: DanglingImmichLink[] | null;
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
  ) {}

  async checkData(): Promise<DataIntegrityReport> {
    const [danglingCitations, possibleDuplicates, danglingImmichLinks] = await Promise.all([
      this.findDanglingCitations(),
      this.findPossibleDuplicates(),
      this.immich.isConfigured() ? this.immich.listDanglingLinks() : Promise.resolve(null),
    ]);
    return { danglingCitations, possibleDuplicates, danglingImmichLinks };
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
    const [danglingNames, danglingEvents, danglingUnions] = await Promise.all([
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
    ]);
    return [
      ...danglingNames.map((row) => Object.assign(row, { factType: "name" })),
      ...danglingEvents.map((row) => Object.assign(row, { factType: "event" })),
      ...danglingUnions.map((row) => Object.assign(row, { factType: "union" })),
    ];
  }

  private async findPossibleDuplicates(): Promise<DuplicatePersonGroup[]> {
    const allPersons = await this.db
      .select({ id: persons.id, given: persons.given, surname: persons.surname })
      .from(persons);
    const groups = new Map<string, DuplicatePersonGroup>();
    for (const person of allPersons) {
      const normalizedSurname = person.surname.trim().toLowerCase();
      if (normalizedSurname === "") continue;
      const key = `${person.given.trim().toLowerCase()}|${normalizedSurname}`;
      const existing = groups.get(key);
      if (existing) {
        existing.people.push(person);
      } else {
        groups.set(key, { given: person.given, surname: person.surname, people: [person] });
      }
    }
    return [...groups.values()].filter((group) => group.people.length > 1);
  }
}
