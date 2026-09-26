import type { HistoricalDate } from "@genealogy/core";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "./client.js";
import { persons, personEvents, type PersonRow } from "./schema.js";

// Exported so callers that need to filter/sort on a vital's own place/date
// (e.g. `PersonService.list`'s place and birth-year filters) can reference the
// same joined aliases `personsWithVitals` uses, rather than re-aliasing
// `personEvents` a second time under a different name.
export const birthEvents = alias(personEvents, "birth_events");
export const deathEvents = alias(personEvents, "death_events");
export const burialEvents = alias(personEvents, "burial_events");

export interface PersonWithVitals extends PersonRow {
  birth: HistoricalDate | null;
  birthPlace: string | null;
  death: HistoricalDate | null;
  deathPlace: string | null;
  /** From the death event's `details` bag (key `causeOfDeath`) — free text, as written in the record. */
  causeOfDeath: string | null;
  burial: HistoricalDate | null;
  burialPlace: string | null;
}

/**
 * `persons` left-joined to its own birth, death and burial `person_events`
 * rows, so every read gets back the same `{birth, birthPlace, death,
 * deathPlace, causeOfDeath, burial, burialPlace}` shape the API has always
 * returned — even though those stopped being columns on `persons` itself
 * (see "Birth and death are events" in TECH_STACK.md). A left join is only
 * safe here because each is enforced to be at most one row per person per
 * type — see the guard in `PersonService.addEvent` — anything less strict
 * would multiply rows.
 *
 * Callers chain `.where(...)`/`.limit(...)`/etc. onto the returned query
 * builder, the same way they would on a plain `db.select().from(persons)`.
 */
export function personsWithVitals(db: Database) {
  return db
    .select({
      ...getTableColumns(persons),
      birth: birthEvents.date,
      birthPlace: birthEvents.place,
      death: deathEvents.date,
      deathPlace: deathEvents.place,
      causeOfDeath: sql<string | null>`${deathEvents.details}->>'causeOfDeath'`,
      burial: burialEvents.date,
      burialPlace: burialEvents.place,
    })
    .from(persons)
    .leftJoin(
      birthEvents,
      and(eq(birthEvents.personId, persons.id), eq(birthEvents.eventType, "birth")),
    )
    .leftJoin(
      deathEvents,
      and(eq(deathEvents.personId, persons.id), eq(deathEvents.eventType, "death")),
    )
    .leftJoin(
      burialEvents,
      and(eq(burialEvents.personId, persons.id), eq(burialEvents.eventType, "burial")),
    );
}
