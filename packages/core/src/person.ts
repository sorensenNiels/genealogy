import { z } from "zod";

/**
 * Genealogical sex as recorded by a source, not gender identity. The GEDCOM
 * vocabulary is kept deliberately, because it is what imports and exports speak.
 */
export const sexSchema = z.enum(["M", "F", "U"]);
export type Sex = z.infer<typeof sexSchema>;

export const personIdSchema = z.uuid();
export type PersonId = z.infer<typeof personIdSchema>;

/**
 * Historical dates are rarely exact. Rather than forcing a `Date`, we keep the
 * source's own wording alongside a resolved range for sorting and filtering.
 *
 * `original` is what the record said ("abt 1742", "3 MAR 1801/02").
 * `earliest`/`latest` bound it as ISO-8601 days once parsed; both null when the
 * text could not be interpreted at all.
 */
export const historicalDateSchema = z.object({
  original: z.string().min(1),
  earliest: z.iso.date().nullable(),
  latest: z.iso.date().nullable(),
});
export type HistoricalDate = z.infer<typeof historicalDateSchema>;

/**
 * Name parts kept separate so they can be searched and sorted independently.
 * Flat rather than nested because it mirrors the `persons` table one-to-one,
 * which keeps a mapping layer out of the API for as long as that stays true.
 */
export const personNameSchema = z.object({
  /**
   * Given names in source order, unsplit: "Anne Marie". There is deliberately
   * no separate "middle name" field — displayed everywhere as "First names",
   * it holds every given name a person has, middle ones included.
   */
  given: z.string().trim().default(""),
  /** Family name as written; spelling variants belong on the source, not here. */
  surname: z.string().trim().default(""),
});
export type PersonName = z.infer<typeof personNameSchema>;

export const personSchema = personNameSchema.extend({
  id: personIdSchema,
  sex: sexSchema,
  /** Formal title or prefix as recorded by a source: "Dr.", "Rev.", "Sir". */
  titlePrefix: z.string().nullable(),
  /** Generational or honorific suffix: "Jr.", "III". */
  suffix: z.string().nullable(),
  /**
   * A filename under the backend's UPLOADS_DIR, not a URL — set only via the
   * photo upload endpoint (apps/backend/src/person/person-photo.controller.ts),
   * never through `updatePersonSchema`.
   */
  photoPath: z.string().nullable(),
  /**
   * Not columns on the `persons` table — birth and death are ordinary
   * `person_events` rows (see "Birth and death are events" in
   * TECH_STACK.md), assembled onto this shape server-side
   * (`personsWithVitals` in `@genealogy/db`) so every existing caller
   * (lifespan/age display, the person form, list/tree/print) keeps working
   * against the same `{birth, birthPlace, death, deathPlace}` fields it
   * always has. `PersonService` is what turns a write to these fields into
   * the matching `person_events` upsert.
   */
  birth: historicalDateSchema.nullable(),
  birthPlace: z.string().nullable(),
  death: historicalDateSchema.nullable(),
  deathPlace: z.string().nullable(),
  notes: z.string().nullable(),
  /**
   * A deliberate flag rather than an inference from `death`, so a person can
   * be marked not-living even absent a recorded death date. Not enforced
   * anywhere yet — it exists so the eventual family-sharing privacy rules
   * (redacting details for living people) aren't a retrofit.
   */
  isLiving: z.boolean(),
});
export type Person = z.infer<typeof personSchema>;

/** Input accepted when creating a person; the id is assigned by the database. */
export const createPersonSchema = z.object({
  given: z.string().trim().default(""),
  surname: z.string().trim().default(""),
  sex: sexSchema.default("U"),
  titlePrefix: z.string().trim().nullable().default(null),
  suffix: z.string().trim().nullable().default(null),
  birth: historicalDateSchema.nullable().default(null),
  birthPlace: z.string().nullable().default(null),
  death: historicalDateSchema.nullable().default(null),
  deathPlace: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  isLiving: z.boolean().default(true),
});
export type CreatePerson = z.infer<typeof createPersonSchema>;

/** Input accepted when editing a person; every field but `id` is optional. */
export const updatePersonSchema = z.object({
  id: personIdSchema,
  given: z.string().trim().optional(),
  surname: z.string().trim().optional(),
  sex: sexSchema.optional(),
  titlePrefix: z.string().trim().nullable().optional(),
  suffix: z.string().trim().nullable().optional(),
  birth: historicalDateSchema.nullable().optional(),
  birthPlace: z.string().nullable().optional(),
  death: historicalDateSchema.nullable().optional(),
  deathPlace: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isLiving: z.boolean().optional(),
});
export type UpdatePerson = z.infer<typeof updatePersonSchema>;

/**
 * `Anne Marie Sørensen`, or `Niels "Pete" Sørensen` when a nickname is set —
 * `Niels "Pete, Junior" Sørensen` when there's more than one — collapsing
 * whitespace where parts are missing.
 */
export function formatPersonName(name: PersonName & { nickname?: string[] | null }): string {
  const nicknames = (name.nickname ?? []).map((n) => n.trim()).filter((n) => n !== "");
  const parts = [
    name.given,
    nicknames.length > 0 ? `"${nicknames.join(", ")}"` : null,
    name.surname,
  ];
  const present = parts.filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return present.length > 0 ? present.join(" ") : "Unknown";
}

/**
 * The formal form of a name, with title/prefix and generational suffix —
 * "Dr. Niels Sørensen, Jr." Reserved for a person's own page header; lists,
 * search results and relative links use the shorter `formatPersonName`. Takes
 * `nickname` as a loose bolt-on rather than off `Person` (which no longer
 * carries one) — callers that already have a person's nicknames on hand (from
 * their `NameVariant` rows) can still pass them through for the quoted form.
 */
export function formatFullPersonName(
  person: PersonName & Pick<Person, "titlePrefix" | "suffix"> & { nickname?: string[] | null },
): string {
  const core = formatPersonName(person);
  const withPrefix =
    person.titlePrefix && person.titlePrefix.trim() !== "" ? `${person.titlePrefix} ${core}` : core;
  return person.suffix && person.suffix.trim() !== ""
    ? `${withPrefix}, ${person.suffix}`
    : withPrefix;
}

/**
 * Lifespan as genealogists write it: "1742–1801", with an en dash, and an open
 * range where one end is unknown. Returns null when neither end is datable.
 */
export function formatLifespan(person: Pick<Person, "birth" | "death">): string | null {
  const born = yearOf(person.birth);
  const died = yearOf(person.death);
  if (born === null && died === null) return null;
  return `${born ?? "?"}–${died ?? "?"}`;
}

function yearOf(date: HistoricalDate | null): string | null {
  const iso = date?.earliest ?? date?.latest ?? null;
  return iso ? iso.slice(0, 4) : null;
}

/**
 * Age in whole years: to `asOf` (default today) if living, otherwise at
 * death. Needs a resolved (parsed) bound on both ends it uses — an
 * unparsed-only date (`earliest`/`latest` both null, just free text) can't
 * anchor an age, so this returns null rather than guessing.
 */
export function calculateAge(
  person: Pick<Person, "birth" | "death" | "isLiving">,
  asOf: Date = new Date(),
): number | null {
  const bornIso = person.birth?.earliest ?? person.birth?.latest ?? null;
  if (!bornIso) return null;

  const endIso = person.isLiving ? null : (person.death?.earliest ?? person.death?.latest ?? null);
  if (!person.isLiving && !endIso) return null;

  const born = new Date(bornIso);
  const end = endIso ? new Date(endIso) : asOf;

  let age = end.getUTCFullYear() - born.getUTCFullYear();
  const hadBirthday =
    end.getUTCMonth() > born.getUTCMonth() ||
    (end.getUTCMonth() === born.getUTCMonth() && end.getUTCDate() >= born.getUTCDate());
  if (!hadBirthday) age -= 1;

  return age >= 0 ? age : null;
}

/** "Age 34", or "Died at age 76" — null when `calculateAge` can't resolve one. */
export function formatAge(
  person: Pick<Person, "birth" | "death" | "isLiving">,
  asOf?: Date,
): string | null {
  const age = calculateAge(person, asOf);
  if (age === null) return null;
  return person.isLiving ? `Age ${age}` : `Died at age ${age}`;
}
