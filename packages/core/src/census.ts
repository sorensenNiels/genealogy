import { z } from "zod";

import { joinHistoricalDateText, parseHistoricalDate } from "./historical-date.js";
import type { HistoricalDate } from "./person.js";
import type { Language } from "./profile.js";

/**
 * A census the app knows the shape of: which country, when it was taken,
 * and which columns it recorded. Picking one in a census record fills in
 * the census day and shows only those columns. The built-in ones are below;
 * more can be added on the Settings page (`recordSettingsSchema.customCensuses`).
 */
export const censusDefinitionSchema = z.object({
  /** Stable id, stored on census records: `${country}-${year}` for the built-in ones. */
  key: z.string().trim().min(1).max(60),
  /** A country code (`dk`, `gb-eng`, ...) or any short name for a custom census. */
  country: z.string().trim().min(1).max(40),
  year: z.number().int().min(1500).max(2100),
  /** The census day (ISO). */
  date: z.iso.date(),
  /** Whether the forms asked where each person was born. */
  hasBirthplace: z.boolean(),
  /** Whether each person's relationship/position to the head of household was recorded. */
  hasRelationship: z.boolean(),
  /** Shown instead of "<country> census <year>" — for a custom census. */
  label: z.string().trim().max(120).optional(),
});
export type CensusDefinition = z.infer<typeof censusDefinitionSchema>;

const census = (
  country: string,
  year: number,
  date: string,
  hasBirthplace: boolean,
  hasRelationship: boolean,
): CensusDefinition => ({
  key: `${country}-${year}`,
  country,
  year,
  date,
  hasBirthplace,
  hasRelationship,
});

/**
 * The national censuses built in, by country. Census days and columns are
 * the commonly documented ones; worth checking against the national
 * archives before relying on a specific day. Notes per country:
 *
 * - Denmark (folketællinger): birthplace from 1845; position in household
 *   always. Copenhagen-only counts (1885, 1895, ...) are left out.
 * - Norway: 1801, then 1865 onwards (birthplace from 1865).
 * - Sweden: the decennial censuses drawn from the parish registers, as of
 *   31 December (not husförhör, which is a different record).
 * - England & Wales and Scotland: census night; 1841 only asked "born in
 *   this county?", so birthplace and relationship from 1851.
 * - USA: individuals named from 1850 (birthplace from 1850, relationship to
 *   head from 1880); 1790–1840 list heads of household only. 1890 is mostly
 *   lost.
 * - Canada: 1851 was taken in January 1852; relationship from 1891.
 */
export const BUILT_IN_CENSUSES: readonly CensusDefinition[] = [
  census("dk", 1787, "1787-07-01", false, true),
  census("dk", 1801, "1801-02-01", false, true),
  census("dk", 1834, "1834-02-18", false, true),
  census("dk", 1840, "1840-02-01", false, true),
  census("dk", 1845, "1845-02-01", true, true),
  census("dk", 1850, "1850-02-01", true, true),
  census("dk", 1855, "1855-02-01", true, true),
  census("dk", 1860, "1860-02-01", true, true),
  census("dk", 1870, "1870-02-01", true, true),
  census("dk", 1880, "1880-02-01", true, true),
  census("dk", 1890, "1890-02-01", true, true),
  census("dk", 1901, "1901-02-01", true, true),
  census("dk", 1906, "1906-02-01", true, true),
  census("dk", 1911, "1911-02-01", true, true),
  census("dk", 1916, "1916-02-01", true, true),
  census("dk", 1921, "1921-02-01", true, true),
  census("dk", 1925, "1925-11-05", true, true),
  census("dk", 1930, "1930-11-05", true, true),
  census("dk", 1940, "1940-11-05", true, true),

  census("no", 1801, "1801-02-01", false, true),
  census("no", 1865, "1865-12-31", true, true),
  census("no", 1875, "1875-12-31", true, true),
  census("no", 1891, "1891-01-01", true, true),
  census("no", 1900, "1900-12-03", true, true),
  census("no", 1910, "1910-12-01", true, true),
  census("no", 1920, "1920-12-01", true, true),

  census("se", 1860, "1860-12-31", true, true),
  census("se", 1870, "1870-12-31", true, true),
  census("se", 1880, "1880-12-31", true, true),
  census("se", 1890, "1890-12-31", true, true),
  census("se", 1900, "1900-12-31", true, true),
  census("se", 1910, "1910-12-31", true, true),
  census("se", 1930, "1930-12-31", true, true),

  census("gb-eng", 1841, "1841-06-06", false, false),
  census("gb-eng", 1851, "1851-03-30", true, true),
  census("gb-eng", 1861, "1861-04-07", true, true),
  census("gb-eng", 1871, "1871-04-02", true, true),
  census("gb-eng", 1881, "1881-04-03", true, true),
  census("gb-eng", 1891, "1891-04-05", true, true),
  census("gb-eng", 1901, "1901-03-31", true, true),
  census("gb-eng", 1911, "1911-04-02", true, true),
  census("gb-eng", 1921, "1921-06-19", true, true),

  census("gb-sct", 1841, "1841-06-06", false, false),
  census("gb-sct", 1851, "1851-03-30", true, true),
  census("gb-sct", 1861, "1861-04-07", true, true),
  census("gb-sct", 1871, "1871-04-02", true, true),
  census("gb-sct", 1881, "1881-04-03", true, true),
  census("gb-sct", 1891, "1891-04-05", true, true),
  census("gb-sct", 1901, "1901-03-31", true, true),
  census("gb-sct", 1911, "1911-04-02", true, true),
  census("gb-sct", 1921, "1921-06-19", true, true),

  census("us", 1790, "1790-08-02", false, false),
  census("us", 1800, "1800-08-04", false, false),
  census("us", 1810, "1810-08-06", false, false),
  census("us", 1820, "1820-08-07", false, false),
  census("us", 1830, "1830-06-01", false, false),
  census("us", 1840, "1840-06-01", false, false),
  census("us", 1850, "1850-06-01", true, false),
  census("us", 1860, "1860-06-01", true, false),
  census("us", 1870, "1870-06-01", true, false),
  census("us", 1880, "1880-06-01", true, true),
  census("us", 1890, "1890-06-02", true, true),
  census("us", 1900, "1900-06-01", true, true),
  census("us", 1910, "1910-04-15", true, true),
  census("us", 1920, "1920-01-01", true, true),
  census("us", 1930, "1930-04-01", true, true),
  census("us", 1940, "1940-04-01", true, true),
  census("us", 1950, "1950-04-01", true, true),

  census("ca", 1851, "1852-01-12", true, false),
  census("ca", 1861, "1861-01-14", true, false),
  census("ca", 1871, "1871-04-02", true, false),
  census("ca", 1881, "1881-04-04", true, false),
  census("ca", 1891, "1891-04-06", true, true),
  census("ca", 1901, "1901-03-31", true, true),
  census("ca", 1911, "1911-06-01", true, true),
  census("ca", 1921, "1921-06-01", true, true),
  census("ca", 1931, "1931-06-01", true, true),
];

/** The countries with built-in censuses, in the order the Settings page lists them. */
export const BUILT_IN_CENSUS_COUNTRIES = [
  "dk",
  "no",
  "se",
  "gb-eng",
  "gb-sct",
  "us",
  "ca",
] as const;

/** Every census the app can offer: the built-in ones plus the custom ones from Settings. */
export function allCensuses(custom: readonly CensusDefinition[] = []): CensusDefinition[] {
  return [...BUILT_IN_CENSUSES, ...custom].toSorted(
    (a, b) => a.country.localeCompare(b.country) || a.year - b.year,
  );
}

/**
 * A census by key — a built-in or custom one; for a key nobody knows any
 * more (a custom census since removed), a stand-in with every column, so an
 * existing record still opens.
 */
export function findCensus(
  key: string | null | undefined,
  custom: readonly CensusDefinition[] = [],
): CensusDefinition | null {
  if (!key) return null;
  const known = [...BUILT_IN_CENSUSES, ...custom].find((definition) => definition.key === key);
  if (known) return known;
  const match = /^(.+)-(\d{4})$/.exec(key);
  return match
    ? {
        key,
        country: match[1]!,
        year: Number(match[2]),
        date: `${match[2]}-01-01`,
        hasBirthplace: true,
        hasRelationship: true,
      }
    : null;
}

/** The census day as a `HistoricalDate`, worded in `language` so it reads and parses there. */
export function censusDayDate(definition: CensusDefinition, language: Language): HistoricalDate {
  const original = joinHistoricalDateText(
    { quality: "exact", value: definition.date, endValue: "" },
    language,
  )!;
  return { original, ...parseHistoricalDate(original, language) };
}

/**
 * The censuses a person could appear in: those taken during their life, in
 * the given countries. With no birth date there's nothing to go on — an
 * empty list, so the coverage grid can say "add a birth date" rather than
 * guess. Without a death date, a deceased person's life is taken as up to
 * 100 years.
 */
export function censusesInLifetime(
  person: { birth: HistoricalDate | null; death: HistoricalDate | null; isLiving: boolean },
  censuses: readonly CensusDefinition[],
  today = new Date(),
): CensusDefinition[] {
  const born = person.birth?.earliest ?? person.birth?.latest ?? null;
  if (!born) return [];
  const died = person.isLiving
    ? today.toISOString().slice(0, 10)
    : (person.death?.latest ??
      person.death?.earliest ??
      `${Number(born.slice(0, 4)) + 100}${born.slice(4)}`);
  return censuses
    .filter((definition) => definition.date >= born && definition.date <= died)
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

/**
 * An age as written in a record, in whole years: "34", "34 år", "34 Aar".
 * Infants are often written in months ("3 mdr", "½") or weeks — those count
 * as 0. Null when there's no number to read.
 */
export function parseRecordAge(text: string | null | undefined): number | null {
  const trimmed = (text ?? "").trim().toLowerCase();
  if (trimmed === "") return null;
  if (/^(½|¼|¾|\d+\s*\/\s*\d+)$/.test(trimmed)) return 0;
  if (/\d\s*(md|mdr|m\b|måned|maaned|uge|uger|weeks?|months?|mos?\b)/.test(trimmed)) return 0;
  const match = /^(\d{1,3})/.exec(trimmed);
  if (!match) return null;
  const years = Number(match[1]);
  return years <= 125 ? years : null;
}

/**
 * The birth an age on a record implies: someone aged `age` on `dayIso` was
 * born within the twelve months before that day `age` years earlier. As a
 * date, it's "about" the year most of those months fall in, worded in
 * `language` so it parses there (Danish doesn't read "abt").
 */
export function estimatedBirthFromAge(
  ageText: string | null | undefined,
  dayIso: string,
  language: Language,
): HistoricalDate | null {
  const age = parseRecordAge(ageText);
  if (age === null) return null;
  const day = new Date(dayIso);
  const latest = new Date(day);
  latest.setUTCFullYear(day.getUTCFullYear() - age);
  // The midpoint of the twelve months before `latest`.
  const midpoint = new Date(latest.getTime() - (365.25 / 2) * 24 * 60 * 60 * 1000);
  const original = joinHistoricalDateText(
    { quality: "about", value: String(midpoint.getUTCFullYear()), endValue: "" },
    language,
  )!;
  return { original, ...parseHistoricalDate(original, language) };
}

/**
 * How many years an age on a record is off from a recorded birth date, or
 * null when they agree (within `tolerance` years either way — ages were
 * often rounded or guessed) or either is unknown.
 */
export function ageMismatch(
  birth: HistoricalDate | null,
  ageText: string | null | undefined,
  dayIso: string,
  tolerance = 2,
): number | null {
  const age = parseRecordAge(ageText);
  const earliest = birth?.earliest ?? birth?.latest ?? null;
  const latest = birth?.latest ?? birth?.earliest ?? null;
  if (age === null || !earliest || !latest) return null;
  const ageOn = (bornIso: string) => {
    const born = new Date(bornIso);
    const day = new Date(dayIso);
    let years = day.getUTCFullYear() - born.getUTCFullYear();
    if (
      day.getUTCMonth() < born.getUTCMonth() ||
      (day.getUTCMonth() === born.getUTCMonth() && day.getUTCDate() < born.getUTCDate())
    ) {
      years -= 1;
    }
    return years;
  };
  // A vague birth date allows a range of true ages.
  const oldest = ageOn(earliest);
  const youngest = ageOn(latest);
  if (age > oldest + tolerance) return age - oldest;
  if (age < youngest - tolerance) return age - youngest;
  return null;
}
