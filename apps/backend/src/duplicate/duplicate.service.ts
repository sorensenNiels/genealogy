import {
  findDuplicatePairs,
  type DuplicateConfidence,
  type DuplicateMatchPerson,
  type DuplicateReason,
  type HistoricalDate,
} from "@genealogy/core";
import {
  allParentOfEdges,
  allSpouseOfEdges,
  duplicateDismissals,
  personEvents,
  personNames,
  personsWithVitals,
  type Database,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";

/** How many pairs the Tools page lists; the rest are counted, and come up as these are merged or dismissed. */
const MAX_LISTED_PAIRS = 200;

/** What a pair shows of each person — the facts it was matched on. */
export interface DuplicatePersonSummary {
  id: string;
  publicId: string;
  given: string;
  surname: string;
  birth: HistoricalDate | null;
  birthPlace: string | null;
  death: HistoricalDate | null;
  deathPlace: string | null;
}

export interface DuplicateCandidate {
  a: DuplicatePersonSummary;
  b: DuplicatePersonSummary;
  score: number;
  confidence: DuplicateConfidence;
  reasons: DuplicateReason[];
}

export interface DuplicateReport {
  candidates: DuplicateCandidate[];
  /** Every pair found, including those past `MAX_LISTED_PAIRS`. */
  total: number;
  dismissed: number;
}

/**
 * Finds likely duplicate people — the scoring itself is `findDuplicatePairs`
 * in `@genealogy/core`; this only gathers what it needs for the whole tree in
 * a handful of bulk reads (people with vitals, alternate names, christening
 * and burial dates, every parent and spouse edge) and remembers the pairs an
 * admin has marked "not a duplicate". Read-only otherwise: the merge itself
 * stays the person page's "Merge with…", which this just points at.
 */
@Injectable()
export class DuplicateService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async list(): Promise<DuplicateReport> {
    const [{ people, byId }, dismissed] = await Promise.all([this.matchInputs(), this.dismissed()]);
    const pairs = findDuplicatePairs(people, {
      isDismissed: (aId, bId) => dismissed.has(`${aId}|${bId}`),
    });
    return {
      candidates: pairs.slice(0, MAX_LISTED_PAIRS).map((pair) => ({
        a: byId.get(pair.aId)!,
        b: byId.get(pair.bId)!,
        score: pair.score,
        confidence: pair.confidence,
        reasons: pair.reasons,
      })),
      total: pairs.length,
      dismissed: dismissed.size,
    };
  }

  /** Likely duplicates of one person — the suggestions at the top of "Merge with…". */
  async forPerson(personId: string): Promise<DuplicateCandidate[]> {
    const [{ people, byId }, dismissed] = await Promise.all([this.matchInputs(), this.dismissed()]);
    return findDuplicatePairs(people, {
      onlyId: personId,
      isDismissed: (aId, bId) => dismissed.has(`${aId}|${bId}`),
    }).map((pair) => {
      // `a` is always the person asked about, whichever id sorts first.
      const [selfId, otherId] = pair.aId === personId ? [pair.aId, pair.bId] : [pair.bId, pair.aId];
      return {
        a: byId.get(selfId)!,
        b: byId.get(otherId)!,
        score: pair.score,
        confidence: pair.confidence,
        reasons: pair.reasons,
      };
    });
  }

  async dismiss(personAId: string, personBId: string, userId: string): Promise<void> {
    const [first, second] = ordered(personAId, personBId);
    await this.db
      .insert(duplicateDismissals)
      .values({ personAId: first, personBId: second, dismissedBy: userId })
      .onConflictDoNothing();
  }

  async undismiss(personAId: string, personBId: string): Promise<void> {
    const [first, second] = ordered(personAId, personBId);
    await this.db
      .delete(duplicateDismissals)
      .where(
        and(eq(duplicateDismissals.personAId, first), eq(duplicateDismissals.personBId, second)),
      );
  }

  /** Forgets every "not a duplicate", so all pairs are suggested again. */
  async clearDismissals(): Promise<{ cleared: number }> {
    const [row] = await this.db.select({ value: count() }).from(duplicateDismissals);
    await this.db.delete(duplicateDismissals);
    return { cleared: row?.value ?? 0 };
  }

  private async dismissed(): Promise<Set<string>> {
    const rows = await this.db
      .select({ a: duplicateDismissals.personAId, b: duplicateDismissals.personBId })
      .from(duplicateDismissals);
    return new Set(rows.map((row) => `${row.a}|${row.b}`));
  }

  private async matchInputs() {
    const [rows, nameRows, proxyRows, parentEdges, spouseEdges] = await Promise.all([
      personsWithVitals(this.db),
      this.db
        .select({
          personId: personNames.personId,
          given: personNames.given,
          surname: personNames.surname,
        })
        .from(personNames),
      // A church book records the baptism and the burial, so an imported
      // person often has those and no birth or death at all.
      this.db
        .select({
          personId: personEvents.personId,
          eventType: personEvents.eventType,
          date: personEvents.date,
          place: personEvents.place,
        })
        .from(personEvents)
        .where(inArray(personEvents.eventType, ["christening", "baptism", "burial"])),
      allParentOfEdges(this.pool),
      allSpouseOfEdges(this.pool),
    ]);

    const birthProxy = new Map<string, { date: HistoricalDate | null; place: string | null }>();
    const deathProxy = new Map<string, { date: HistoricalDate | null; place: string | null }>();
    for (const row of proxyRows) {
      const target = row.eventType === "burial" ? deathProxy : birthProxy;
      // First one wins; a person with two baptisms is rare and either will do.
      if (!target.has(row.personId)) target.set(row.personId, row);
    }

    const otherNames = groupBy(nameRows, (row) => row.personId);
    const nameOf = new Map(rows.map((row) => [row.id, { given: row.given, surname: row.surname }]));
    const parents = new Map<string, string[]>();
    const relatives = new Map<string, Set<string>>();
    const link = (from: string, to: string) => {
      const set = relatives.get(from) ?? new Set<string>();
      set.add(to);
      relatives.set(from, set);
    };
    for (const edge of parentEdges) {
      parents.set(edge.childId, [...(parents.get(edge.childId) ?? []), edge.parentId]);
      link(edge.childId, edge.parentId);
      link(edge.parentId, edge.childId);
    }
    const spouses = new Map<string, string[]>();
    for (const edge of spouseEdges) {
      spouses.set(edge.aId, [...(spouses.get(edge.aId) ?? []), edge.bId]);
      spouses.set(edge.bId, [...(spouses.get(edge.bId) ?? []), edge.aId]);
      link(edge.aId, edge.bId);
      link(edge.bId, edge.aId);
    }
    const named = (ids: string[] | undefined) =>
      (ids ?? []).flatMap((id) => {
        const name = nameOf.get(id);
        return name ? [{ id, ...name }] : [];
      });

    const byId = new Map<string, DuplicatePersonSummary>();
    const people: DuplicateMatchPerson[] = rows.map((row) => {
      const birth = row.birth ? { date: row.birth, place: row.birthPlace } : birthProxy.get(row.id);
      const death = row.death ? { date: row.death, place: row.deathPlace } : deathProxy.get(row.id);
      const summary: DuplicatePersonSummary = {
        id: row.id,
        publicId: row.publicId,
        given: row.given,
        surname: row.surname,
        birth: birth?.date ?? null,
        birthPlace: row.birthPlace ?? birth?.place ?? null,
        death: death?.date ?? null,
        deathPlace: row.deathPlace ?? death?.place ?? null,
      };
      byId.set(row.id, summary);
      return {
        id: row.id,
        given: row.given,
        surname: row.surname,
        gender: row.gender,
        otherNames: otherNames.get(row.id) ?? [],
        birth: summary.birth,
        birthPlace: summary.birthPlace,
        death: summary.death,
        deathPlace: summary.deathPlace,
        parents: named(parents.get(row.id)),
        spouses: named(spouses.get(row.id)),
        relativeIds: relatives.get(row.id) ?? new Set(),
      };
    });
    return { people, byId };
  }
}

/** The order `duplicate_dismissals` stores a pair in — its check constraint requires a < b. */
function ordered(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}
