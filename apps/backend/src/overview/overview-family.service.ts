import {
  isOnThisDay,
  kinshipsFrom,
  pickOfTheDay,
  yearsSince,
  type Gender,
  type HistoricalDate,
  type Kinship,
  type OnThisDayEvent,
} from "@genealogy/core";
import {
  allParentOfEdges,
  allSpouseOfEdges,
  ancestorsByGeneration,
  birthEvents,
  childrenOf,
  personEvents,
  persons,
  personsWithVitals,
  sources,
  unions,
  userProfiles,
  type Database,
  type PersonWithVitals,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, count, countDistinct, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";

/** The event types each "On this day" choice covers: a baptism stands in for a birth, a burial for a death. */
const ON_THIS_DAY_TYPES: Record<Exclude<OnThisDayEvent, "marriage">, string[]> = {
  birth: ["birth", "christening"],
  death: ["death", "burial", "cremation"],
};

/** How many "On this day" entries and top places a card lists. */
const MAX_ON_THIS_DAY = 8;
const MAX_TOP_PLACES = 8;

export interface OnThisDayPerson {
  id: string;
  given: string;
  surname: string;
  gender: Gender;
  isLiving: boolean;
}

export interface OnThisDayEntry {
  kind: OnThisDayEvent;
  /** The event type ("christening", "burial", ...); "marriage" for a union. */
  eventType: string;
  date: HistoricalDate;
  place: string | null;
  /** One person, or the couple for a marriage. */
  people: OnThisDayPerson[];
  yearsAgo: number | null;
}

export interface FeaturedAncestor {
  person: PersonWithVitals;
  unions: {
    startDate: HistoricalDate | null;
    startPlace: string | null;
    status: string;
    partnerId: string;
    partnerName: { given: string; surname: string };
  }[];
  childCount: number;
  /** How they're related to the member, when the member has linked themselves. */
  kinship: Kinship | null;
  /** Whether they were picked from the member's own ancestors. */
  isOwnAncestor: boolean;
}

export interface FamilyAtAGlance {
  people: number;
  earliestBirthYear: number | null;
  latestBirthYear: number | null;
  surnames: number;
  places: number;
  sources: number;
  photos: number;
  /** The person born earliest — the furthest back the tree reaches. */
  earliest: PersonWithVitals | null;
}

/** A day's anniversaries and the family-wide figures: the Overview's cards for everyone. */
@Injectable()
export class OverviewFamilyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Births, marriages and deaths on `month`/`day` in past years, oldest
   * first, exact dates only (`isOnThisDay`). An entry naming anyone living
   * is left out unless `includeLiving` — the router passes that only for an
   * editor with "living birthdays" on, never for a Viewer.
   */
  async onThisDay(options: {
    month: number;
    day: number;
    todayIso: string;
    events: readonly OnThisDayEvent[];
    includeLiving: boolean;
  }): Promise<OnThisDayEntry[]> {
    // Same month-day text in the exact date's ISO form — the index-free
    // filter is fine at family-tree scale; `isOnThisDay` re-checks in code.
    const monthDay = `${String(options.month).padStart(2, "0")}-${String(options.day).padStart(2, "0")}`;
    const onDay = (column: typeof personEvents.date | typeof unions.startDate) =>
      sql`(${column}->>'earliest') = (${column}->>'latest') and substr(${column}->>'earliest', 6, 5) = ${monthDay}`;

    const eventTypes = options.events.flatMap((event) =>
      event === "marriage" ? [] : ON_THIS_DAY_TYPES[event],
    );
    const eventRows =
      eventTypes.length > 0
        ? await this.db
            .select({
              eventType: personEvents.eventType,
              date: personEvents.date,
              place: personEvents.place,
              id: persons.id,
              given: persons.given,
              surname: persons.surname,
              gender: persons.gender,
              isLiving: persons.isLiving,
            })
            .from(personEvents)
            .innerJoin(persons, eq(persons.id, personEvents.personId))
            .where(and(inArray(personEvents.eventType, eventTypes), onDay(personEvents.date)))
        : [];

    const unionRows = options.events.includes("marriage")
      ? await this.db
          .select({
            date: unions.startDate,
            place: unions.startPlace,
            personAId: unions.personAId,
            personBId: unions.personBId,
          })
          .from(unions)
          .where(onDay(unions.startDate))
      : [];
    const partnerIds = [...new Set(unionRows.flatMap((row) => [row.personAId, row.personBId]))];
    const partners = new Map(
      (partnerIds.length > 0
        ? await this.db
            .select({
              id: persons.id,
              given: persons.given,
              surname: persons.surname,
              gender: persons.gender,
              isLiving: persons.isLiving,
            })
            .from(persons)
            .where(inArray(persons.id, partnerIds))
        : []
      ).map((row) => [row.id, row as OnThisDayPerson]),
    );

    const entries: OnThisDayEntry[] = [
      ...eventRows.flatMap((row): OnThisDayEntry[] =>
        row.date && isOnThisDay(row.date, options.month, options.day)
          ? [
              {
                kind: ON_THIS_DAY_TYPES.birth.includes(row.eventType) ? "birth" : "death",
                eventType: row.eventType,
                date: row.date,
                place: row.place,
                people: [
                  {
                    id: row.id,
                    given: row.given,
                    surname: row.surname,
                    gender: row.gender as Gender,
                    isLiving: row.isLiving,
                  },
                ],
                yearsAgo: yearsSince(row.date, options.todayIso),
              },
            ]
          : [],
      ),
      ...unionRows.flatMap((row): OnThisDayEntry[] => {
        const people = [partners.get(row.personAId), partners.get(row.personBId)].filter(
          (person): person is OnThisDayPerson => person !== undefined,
        );
        return row.date && isOnThisDay(row.date, options.month, options.day)
          ? [
              {
                kind: "marriage",
                eventType: "marriage",
                date: row.date,
                place: row.place,
                people,
                yearsAgo: yearsSince(row.date, options.todayIso),
              },
            ]
          : [];
      }),
    ];
    return entries
      .filter((entry) => options.includeLiving || entry.people.every((person) => !person.isLiving))
      .toSorted((a, b) => (a.date.earliest ?? "").localeCompare(b.date.earliest ?? ""))
      .slice(0, MAX_ON_THIS_DAY);
  }

  /**
   * One deceased person for the day (`pickOfTheDay`): someone with a photo
   * or both a birth and a death date, so there's something to show. From
   * the member's own ancestors when they've linked themselves and any
   * qualify, else from everyone. The living are never featured — the card
   * is the same for a Viewer.
   */
  async featuredAncestor(userId: string, dayIso: string): Promise<FeaturedAncestor | null> {
    const candidates = await this.db
      .select({ id: persons.id })
      .from(persons)
      .leftJoin(
        birthEvents,
        and(eq(birthEvents.personId, persons.id), eq(birthEvents.eventType, "birth")),
      )
      .where(
        and(
          eq(persons.isLiving, false),
          or(
            isNotNull(persons.photoPath),
            and(
              isNotNull(sql`${birthEvents.date}->>'earliest'`),
              sql`exists (select 1 from ${personEvents} where ${personEvents.personId} = ${persons.id} and ${personEvents.eventType} = 'death' and ${personEvents.date}->>'earliest' is not null)`,
            ),
          ),
        ),
      );
    const candidateIds = candidates.map((row) => row.id);

    const [profile] = await this.db
      .select({ personId: userProfiles.personId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const rootId = profile?.personId ?? null;
    const ancestorIds = rootId
      ? new Set((await ancestorsByGeneration(this.pool, rootId)).map((node) => node.personId))
      : new Set<string>();
    const ownCandidates = candidateIds.filter((id) => ancestorIds.has(id));
    const pickedId = pickOfTheDay(ownCandidates.length > 0 ? ownCandidates : candidateIds, dayIso);
    if (!pickedId) return null;

    const [[person], unionRows, children, kinship] = await Promise.all([
      personsWithVitals(this.db).where(eq(persons.id, pickedId)),
      this.db
        .select()
        .from(unions)
        .where(or(eq(unions.personAId, pickedId), eq(unions.personBId, pickedId))),
      childrenOf(this.pool, pickedId),
      rootId ? this.kinship(rootId, pickedId) : Promise.resolve(null),
    ]);
    if (!person) return null;
    const partnerIds = unionRows.map((union) =>
      union.personAId === pickedId ? union.personBId : union.personAId,
    );
    const partnerNames = new Map(
      (partnerIds.length > 0
        ? await this.db
            .select({ id: persons.id, given: persons.given, surname: persons.surname })
            .from(persons)
            .where(inArray(persons.id, partnerIds))
        : []
      ).map((row) => [row.id, { given: row.given, surname: row.surname }]),
    );
    return {
      person,
      unions: unionRows.map((union, index) => ({
        startDate: union.startDate,
        startPlace: union.startPlace,
        status: union.status,
        partnerId: partnerIds[index]!,
        partnerName: partnerNames.get(partnerIds[index]!) ?? { given: "", surname: "" },
      })),
      childCount: children.length,
      kinship,
      isOwnAncestor: ancestorIds.has(pickedId),
    };
  }

  /** How `personId` is related to `rootId`, over the whole tree — the tree page's kinship, for one person. */
  private async kinship(rootId: string, personId: string): Promise<Kinship | null> {
    const [people, parentEdges, spouseEdges] = await Promise.all([
      this.db.select({ id: persons.id, gender: persons.gender }).from(persons),
      allParentOfEdges(this.pool),
      allSpouseOfEdges(this.pool),
    ]);
    return (
      kinshipsFrom(rootId, {
        people,
        parentEdges,
        spouseEdges: spouseEdges.map((edge) => [edge.aId, edge.bId] as const),
      }).get(personId) ?? null
    );
  }

  /**
   * The family's figures, each a count over the whole tree. `excludeLiving`
   * for a Viewer: the birth span and birthplace count are read from the
   * deceased only — the latest birth year would otherwise be the youngest
   * living relative's, which a Viewer isn't shown.
   */
  async familyAtAGlance(excludeLiving: boolean): Promise<FamilyAtAGlance> {
    const birthYear = sql<number>`substr(${personEvents.date}->>'earliest', 1, 4)::int`;
    const deceasedOnly = excludeLiving
      ? sql`exists (select 1 from ${persons} where ${persons.id} = ${personEvents.personId} and not ${persons.isLiving})`
      : undefined;
    const [[people], [births], [surnames], [places], [sourceCount], [photos], [earliestRow]] =
      await Promise.all([
        this.db.select({ value: count() }).from(persons),
        this.db
          .select({
            earliest: sql<number | null>`min(${birthYear})`,
            latest: sql<number | null>`max(${birthYear})`,
          })
          .from(personEvents)
          .where(
            and(
              eq(personEvents.eventType, "birth"),
              isNotNull(sql`${personEvents.date}->>'earliest'`),
              deceasedOnly,
            ),
          ),
        this.db
          .select({ value: countDistinct(sql`nullif(trim(${persons.surname}), '')`) })
          .from(persons),
        this.db
          .select({ value: countDistinct(sql`nullif(trim(${personEvents.place}), '')`) })
          .from(personEvents)
          .where(and(eq(personEvents.eventType, "birth"), deceasedOnly)),
        this.db.select({ value: count() }).from(sources),
        this.db.select({ value: count() }).from(persons).where(isNotNull(persons.photoPath)),
        this.db
          .select({ id: personEvents.personId })
          .from(personEvents)
          .where(
            and(
              eq(personEvents.eventType, "birth"),
              isNotNull(sql`${personEvents.date}->>'earliest'`),
              deceasedOnly,
            ),
          )
          .orderBy(sql`${personEvents.date}->>'earliest' asc`)
          .limit(1),
      ]);
    const [earliest] = earliestRow
      ? await personsWithVitals(this.db).where(eq(persons.id, earliestRow.id))
      : [];
    return {
      people: people?.value ?? 0,
      earliestBirthYear: births?.earliest ?? null,
      latestBirthYear: births?.latest ?? null,
      surnames: surnames?.value ?? 0,
      places: places?.value ?? 0,
      sources: sourceCount?.value ?? 0,
      photos: photos?.value ?? 0,
      earliest: earliest ?? null,
    };
  }

  /**
   * The most common birthplaces, with how many were born there — "where the
   * family came from" until there's a map. `excludeLiving` for a Viewer,
   * whose view of a living person has no birthplace to count.
   */
  async topPlaces(excludeLiving: boolean): Promise<{ place: string; count: number }[]> {
    const place = sql<string>`trim(${personEvents.place})`;
    const rows = await this.db
      .select({ place, count: count() })
      .from(personEvents)
      .innerJoin(persons, eq(persons.id, personEvents.personId))
      .where(
        and(
          eq(personEvents.eventType, "birth"),
          sql`nullif(trim(${personEvents.place}), '') is not null`,
          excludeLiving ? eq(persons.isLiving, false) : undefined,
        ),
      )
      .groupBy(place)
      .orderBy(desc(count()), place)
      .limit(MAX_TOP_PLACES);
    return rows;
  }
}
