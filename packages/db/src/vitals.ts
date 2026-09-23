import type { HistoricalDate } from "@genealogy/core";
import { and, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "./client.js";
import { persons, personEvents, type PersonRow } from "./schema.js";

const birthEvents = alias(personEvents, "birth_events");
const deathEvents = alias(personEvents, "death_events");

export interface PersonWithVitals extends PersonRow {
  birth: HistoricalDate | null;
  birthPlace: string | null;
  death: HistoricalDate | null;
  deathPlace: string | null;
}

/**
 * `persons` left-joined to its own birth and death `person_events` rows, so
 * every read gets back the same `{birth, birthPlace, death, deathPlace}`
 * shape the API has always returned — even though those stopped being
 * columns on `persons` itself (see "Birth and death are events" in
 * TECH_STACK.md). A left join is only safe here because birth/death are
 * enforced to be at most one row per person per type — see the guard in
 * `PersonService.addEvent` — anything less strict would multiply rows.
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
    })
    .from(persons)
    .leftJoin(
      birthEvents,
      and(eq(birthEvents.personId, persons.id), eq(birthEvents.eventType, "birth")),
    )
    .leftJoin(
      deathEvents,
      and(eq(deathEvents.personId, persons.id), eq(deathEvents.eventType, "death")),
    );
}
