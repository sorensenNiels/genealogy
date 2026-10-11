import {
  allCensuses,
  censusesInLifetime,
  researchCheckKeySchema,
  type CensusDefinition,
  type ResearchCheckKey,
} from "@genealogy/core";
import {
  invitations,
  personImmichLinks,
  persons,
  personsWithVitals,
  recordPeople,
  records,
  recordSearches,
  researchNotes,
  type Database,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, count, countDistinct, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";
import { DuplicateService } from "../duplicate/duplicate.service.js";
import { ImmichService } from "../immich/immich.service.js";
import { IntegrityService } from "../integrity/integrity.service.js";
import { PersonService } from "../person/person.service.js";
import { SettingsService } from "../settings/settings.service.js";

const MAX_OPEN_NOTES = 5;
const MAX_RECENT_PEOPLE = 5;
const MAX_CENSUSES = 5;
/** A few of the people each census gap names, as a start. */
const CENSUS_SAMPLE = 3;
/** How long "Things to look at" reuses its counts: the reports behind them read the whole tree. */
const UPKEEP_CACHE_MS = 10 * 60 * 1000;

export interface ResearchTodo {
  openNotes: {
    id: string;
    noteType: string;
    body: string;
    createdAt: Date;
    personId: string;
    given: string;
    surname: string;
  }[];
  openNoteCount: number;
  /** How many people are missing each research checklist item — the People list's "Missing" filter. */
  missing: { key: ResearchCheckKey; count: number }[];
}

export interface CensusGap {
  census: CensusDefinition;
  /** People alive on the census day with no census record and not marked "searched, not found". */
  count: number;
  sample: { id: string; given: string; surname: string }[];
}

export interface UpkeepCounts {
  /** Pairs rated "high" — the Tools page's "Likely". */
  likelyDuplicates: number;
  possibleDuplicates: number;
  integrityFindings: number;
  presumedDeceased: number;
  /** Null when Immich isn't available. */
  unlinkedFaces: number | null;
  pendingInvitations: number;
  checkedAt: Date;
}

/** The Overview's research cards (editors) and upkeep card (admins). */
@Injectable()
export class OverviewResearchService {
  private upkeepCache: UpkeepCounts | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly people: PersonService,
    private readonly settings: SettingsService,
    private readonly duplicates: DuplicateService,
    private readonly integrity: IntegrityService,
    private readonly immich: ImmichService,
  ) {}

  /** Open research notes, newest first, and how many people each checklist item is still missing for. */
  async researchTodo(viewerUserId: string): Promise<ResearchTodo> {
    const open = eq(researchNotes.resolved, false);
    const [openNotes, [openCount], missing] = await Promise.all([
      this.db
        .select({
          id: researchNotes.id,
          noteType: researchNotes.noteType,
          body: researchNotes.body,
          createdAt: researchNotes.createdAt,
          personId: persons.id,
          given: persons.given,
          surname: persons.surname,
        })
        .from(researchNotes)
        .innerJoin(persons, eq(persons.id, researchNotes.personId))
        .where(open)
        .orderBy(desc(researchNotes.createdAt))
        .limit(MAX_OPEN_NOTES),
      this.db.select({ value: count() }).from(researchNotes).where(open),
      // The People list's own count for each filter, so a number here is
      // exactly what the link opens.
      Promise.all(
        researchCheckKeySchema.options.map(async (key) => {
          const result = await this.people.list({
            limit: 1,
            offset: 0,
            search: null,
            gender: null,
            place: null,
            bornAfter: null,
            bornBefore: null,
            missing: key,
            hasOpenResearchNote: false,
            directAncestorsOnly: false,
            sortBy: "surname",
            sortDir: "asc",
            grouping: "none",
            similarSpellings: false,
            withFamily: false,
            viewerUserId,
            excludeLiving: false,
          });
          return { key, count: result.total };
        }),
      ),
    ]);
    return { openNotes, openNoteCount: openCount?.value ?? 0, missing };
  }

  /**
   * The censuses (of Settings → Records' coverage countries) with the most
   * people still to look for — alive on the census day by
   * `censusesInLifetime`, neither found in a census record of it nor marked
   * searched. The person page's coverage grid, summed over the tree.
   */
  async censusGaps(): Promise<CensusGap[]> {
    const recordSettings = await this.settings.getRecordSettings();
    const countries = new Set(recordSettings.coverageCountries);
    const censuses = allCensuses(recordSettings.customCensuses).filter((census) =>
      countries.has(census.country),
    );
    if (censuses.length === 0) return [];

    const [people, found, searched] = await Promise.all([
      personsWithVitals(this.db),
      this.db
        .select({ personId: recordPeople.personId, censusKey: records.censusKey })
        .from(recordPeople)
        .innerJoin(records, eq(records.id, recordPeople.recordId))
        .where(and(isNotNull(recordPeople.personId), eq(records.recordType, "census"))),
      this.db
        .select({ personId: recordSearches.personId, censusKey: recordSearches.censusKey })
        .from(recordSearches),
    ]);
    const done = new Set([...found, ...searched].map((row) => `${row.personId}|${row.censusKey}`));

    const gaps = new Map<string, CensusGap>();
    for (const person of people) {
      for (const census of censusesInLifetime(person, censuses)) {
        if (done.has(`${person.id}|${census.key}`)) continue;
        const gap = gaps.get(census.key) ?? { census, count: 0, sample: [] };
        gap.count += 1;
        if (gap.sample.length < CENSUS_SAMPLE) {
          gap.sample.push({ id: person.id, given: person.given, surname: person.surname });
        }
        gaps.set(census.key, gap);
      }
    }
    return [...gaps.values()]
      .toSorted((a, b) => b.count - a.count || a.census.date.localeCompare(b.census.date))
      .slice(0, MAX_CENSUSES);
  }

  /**
   * The newest people, and people changed since they were added — to pick
   * up where someone else left off. Who made a change isn't recorded
   * (there's no audit log), so this says what and when, not who.
   */
  async recentChanges() {
    const columns = {
      id: persons.id,
      given: persons.given,
      surname: persons.surname,
      gender: persons.gender,
      createdAt: persons.createdAt,
      updatedAt: persons.updatedAt,
    };
    const [added, changed] = await Promise.all([
      this.db
        .select(columns)
        .from(persons)
        .orderBy(desc(persons.createdAt))
        .limit(MAX_RECENT_PEOPLE),
      this.db
        .select(columns)
        .from(persons)
        // A minute's grace: a new person is saved twice on the way in.
        .where(gt(persons.updatedAt, sql`${persons.createdAt} + interval '1 minute'`))
        .orderBy(desc(persons.updatedAt))
        .limit(MAX_RECENT_PEOPLE),
    ]);
    return { added, changed };
  }

  /**
   * The Tools reports as counts, for admins to see at a glance what needs
   * them. Reused for `UPKEEP_CACHE_MS` — duplicate detection and the
   * integrity check read the whole tree — unless `refresh`.
   */
  async upkeep(refresh = false): Promise<UpkeepCounts> {
    if (
      !refresh &&
      this.upkeepCache &&
      Date.now() - this.upkeepCache.checkedAt.getTime() < UPKEEP_CACHE_MS
    ) {
      return this.upkeepCache;
    }
    const { presumeDeceasedAfterYears } = await this.settings.getPersonSettings();
    const [duplicates, integrity, presumed, unlinkedFaces, [pending]] = await Promise.all([
      this.duplicates.list(),
      this.integrity.checkData(),
      this.people.presumedDeceased(presumeDeceasedAfterYears),
      this.unlinkedFaces(),
      this.db
        .select({ value: count() })
        .from(invitations)
        .where(
          and(
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        ),
    ]);
    const likely = duplicates.candidates.filter((pair) => pair.confidence === "high").length;
    this.upkeepCache = {
      likelyDuplicates: likely,
      possibleDuplicates: duplicates.total - likely,
      integrityFindings:
        integrity.danglingCitations.length +
        (integrity.danglingImmichLinks?.length ?? 0) +
        integrity.recordAgeMismatches.length,
      presumedDeceased: presumed.length,
      unlinkedFaces,
      pendingInvitations: pending?.value ?? 0,
      checkedAt: new Date(),
    };
    return this.upkeepCache;
  }

  /** Immich's face clusters not linked to anyone in the tree; null when Immich can't be asked. */
  private async unlinkedFaces(): Promise<number | null> {
    try {
      if (!(await this.immich.isAvailable())) return null;
      const [{ total }, [linked]] = await Promise.all([
        this.immich.listPeople(1, 1),
        this.db
          .select({ value: countDistinct(personImmichLinks.immichPersonId) })
          .from(personImmichLinks),
      ]);
      return Math.max(0, total - (linked?.value ?? 0));
    } catch {
      return null;
    }
  }
}
