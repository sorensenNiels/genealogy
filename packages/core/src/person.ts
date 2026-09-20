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
  /** Given names in source order, unsplit: "Anne Marie". */
  given: z.string().trim().default(""),
  /** Family name as written; spelling variants belong on the source, not here. */
  surname: z.string().trim().default(""),
  /** Patronymic, where a culture uses one distinctly from the surname. */
  patronymic: z.string().trim().nullable().default(null),
});
export type PersonName = z.infer<typeof personNameSchema>;

export const personSchema = personNameSchema.extend({
  id: personIdSchema,
  sex: sexSchema,
  birth: historicalDateSchema.nullable(),
  birthPlace: z.string().nullable(),
  death: historicalDateSchema.nullable(),
  deathPlace: z.string().nullable(),
  notes: z.string().nullable(),
});
export type Person = z.infer<typeof personSchema>;

/** Input accepted when creating a person; the id is assigned by the database. */
export const createPersonSchema = z.object({
  given: z.string().trim().default(""),
  surname: z.string().trim().default(""),
  patronymic: z.string().trim().nullable().default(null),
  sex: sexSchema.default("U"),
  birth: historicalDateSchema.nullable().default(null),
  birthPlace: z.string().nullable().default(null),
  death: historicalDateSchema.nullable().default(null),
  deathPlace: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});
export type CreatePerson = z.infer<typeof createPersonSchema>;

/** "Anne Marie Sørensen", collapsing whitespace where parts are missing. */
export function formatPersonName(name: PersonName): string {
  const parts = [name.given, name.patronymic, name.surname];
  const present = parts.filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return present.length > 0 ? present.join(" ") : "Unknown";
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
