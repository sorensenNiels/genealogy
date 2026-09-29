import type { Language } from "./profile.js";

/**
 * A precision-tagged calendar date used inside a `ParsedHistoricalDate` — a
 * single day ("12 MAR 1901"), a month ("MAR 1901"), or a year ("1901"). Each
 * carries its own ISO day bounds so a range built from two parts (`between`,
 * `from-to`) can mix precisions on either side.
 */
export type DatePrecision = "day" | "month" | "year";

export interface ParsedDatePart {
  precision: DatePrecision;
  year: number;
  /** null when `precision === "year"`. */
  month: number | null;
  /** null unless `precision === "day"`. */
  day: number | null;
  earliest: string;
  latest: string;
}

/**
 * The structured result of reading a date's free-text wording — richer than
 * plain ISO bounds because a bound alone can't be turned back into accurate
 * wording: "bef 1920" and an exact "31 DEC 1920" both end at `1920-12-31`,
 * but need different display text. `parseHistoricalDate` collapses this to
 * bounds for storage; `formatHistoricalDate` expands it back to words.
 */
export type ParsedHistoricalDate =
  | { kind: "exact"; date: ParsedDatePart }
  | { kind: "about"; date: ParsedDatePart }
  | { kind: "before"; date: ParsedDatePart }
  | { kind: "after"; date: ParsedDatePart }
  | { kind: "between"; start: ParsedDatePart; end: ParsedDatePart }
  | { kind: "from-to"; start: ParsedDatePart; end: ParsedDatePart }
  | { kind: "unparsed" };

/**
 * Everything about reading/writing dates that differs by language — quality
 * words, "and"/"to" connectors, and month names/abbreviations. Every parsing
 * and formatting function below takes a `language` (default `"en"`, so every
 * pre-i18n caller keeps working unchanged) and looks its config up here,
 * rather than branching on language inline throughout the file.
 */
interface DateLanguage {
  approximate: RegExp;
  before: RegExp;
  after: RegExp;
  between: RegExp;
  fromTo: RegExp;
  /** Lowercased 3-letter abbreviation → month number (1-12). */
  months: Record<string, number>;
  monthNames: string[];
  aboutWord: string;
  beforeWord: string;
  afterWord: string;
  betweenWord: string;
  andWord: string;
  fromWord: string;
  toWord: string;
}

const EN: DateLanguage = {
  approximate: /^(?:abt|about|circa|c|cal|est|estimated)\.?\s+/i,
  before: /^(?:bef|before)\.?\s+(.+)$/i,
  after: /^(?:aft|after)\.?\s+(.+)$/i,
  between: /^(?:bet|between)\.?\s+(.+?)\s+and\s+(.+)$/i,
  fromTo: /^from\s+(.+?)\s+to\s+(.+)$/i,
  months: {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  },
  monthNames: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  aboutWord: "About",
  beforeWord: "Before",
  afterWord: "After",
  betweenWord: "Between",
  andWord: "and",
  fromWord: "From",
  toWord: "to",
};

/**
 * Danish month names/abbreviations are all plain ASCII, but the quality
 * words are not ("før") — safe as literal regex text in a UTF-8 source
 * file, no charset gymnastics needed.
 */
const DA: DateLanguage = {
  approximate: /^(?:ca|cirka|omkring)\.?\s+/i,
  before: /^før\.?\s+(.+)$/i,
  after: /^efter\.?\s+(.+)$/i,
  between: /^mellem\.?\s+(.+?)\s+og\s+(.+)$/i,
  fromTo: /^fra\s+(.+?)\s+til\s+(.+)$/i,
  months: {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    maj: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    okt: 10,
    nov: 11,
    dec: 12,
  },
  monthNames: [
    "januar",
    "februar",
    "marts",
    "april",
    "maj",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "december",
  ],
  aboutWord: "Cirka",
  beforeWord: "Før",
  afterWord: "Efter",
  betweenWord: "Mellem",
  andWord: "og",
  fromWord: "Fra",
  toWord: "til",
};

const LANGUAGES: Record<Language, DateLanguage> = { en: EN, da: DA };

/**
 * Reads the free-text wording a source uses for a date ("abt 1854",
 * "12 MAR 1901", "MAR 1901", "1970-11-18", "bef 1920", "BET 1850 AND 1860",
 * "FROM 1900 TO 1905") into a structured, precision-tagged result. This is a
 * first pass covering the wordings this app's own date fields actually
 * produce, not the full GEDCOM date grammar (no double-dating, no calendar
 * escapes yet) — see "GEDCOM import and export" in TECH_STACK.md.
 *
 * Deliberately does not guess at ambiguous numeric-only dates like
 * "03/04/1901" (DD/MM vs MM/DD disagree by locale) — those come back
 * `{ kind: "unparsed" }` rather than picking a side.
 */
export function parseHistoricalDateDetailed(
  text: string,
  language: Language = "en",
): ParsedHistoricalDate {
  const lang = LANGUAGES[language];
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "unparsed" };

  const between = lang.between.exec(trimmed);
  if (between) {
    const start = parseDatePart((between[1] ?? "").trim(), lang);
    const end = parseDatePart((between[2] ?? "").trim(), lang);
    return start && end ? { kind: "between", start, end } : { kind: "unparsed" };
  }

  const fromTo = lang.fromTo.exec(trimmed);
  if (fromTo) {
    const start = parseDatePart((fromTo[1] ?? "").trim(), lang);
    const end = parseDatePart((fromTo[2] ?? "").trim(), lang);
    return start && end ? { kind: "from-to", start, end } : { kind: "unparsed" };
  }

  const before = lang.before.exec(trimmed);
  if (before) {
    const date = parseDatePart((before[1] ?? "").trim(), lang);
    return date ? { kind: "before", date } : { kind: "unparsed" };
  }

  const after = lang.after.exec(trimmed);
  if (after) {
    const date = parseDatePart((after[1] ?? "").trim(), lang);
    return date ? { kind: "after", date } : { kind: "unparsed" };
  }

  const isApproximate = lang.approximate.test(trimmed);
  const date = parseDatePart(trimmed.replace(lang.approximate, ""), lang);
  if (!date) return { kind: "unparsed" };
  return { kind: isApproximate ? "about" : "exact", date };
}

/**
 * Collapses a parsed date to plain ISO-8601 day bounds — enough to compute an
 * age or sort a list, but not enough to reconstruct display wording (see
 * `parseHistoricalDateDetailed`'s doc comment). Kept as its own function
 * because callers that only ever needed bounds (`resolveDate` in the
 * backend, the historical-date backfill script) shouldn't have to unpack a
 * `ParsedHistoricalDate` themselves.
 */
export function parseHistoricalDate(
  text: string,
  language: Language = "en",
): {
  earliest: string | null;
  latest: string | null;
} {
  return boundsOf(parseHistoricalDateDetailed(text, language));
}

/**
 * Turns a parsed date back into normalized, human-readable wording — e.g.
 * "1901-03-12", "12 MAR 1901" and "12 March 1901" all become
 * "12 March 1901". Returns null only for `{ kind: "unparsed" }`; callers fall
 * back to the original typed text in that case, never hiding it.
 */
export function formatHistoricalDate(
  parsed: ParsedHistoricalDate,
  language: Language = "en",
): string | null {
  const lang = LANGUAGES[language];
  switch (parsed.kind) {
    case "exact":
      return formatDatePart(parsed.date, lang);
    case "about":
      return `${lang.aboutWord} ${formatDatePart(parsed.date, lang)}`;
    case "before":
      return `${lang.beforeWord} ${formatDatePart(parsed.date, lang)}`;
    case "after":
      return `${lang.afterWord} ${formatDatePart(parsed.date, lang)}`;
    case "between":
      return `${lang.betweenWord} ${formatDatePart(parsed.start, lang)} ${lang.andWord} ${formatDatePart(parsed.end, lang)}`;
    case "from-to":
      return `${lang.fromWord} ${formatDatePart(parsed.start, lang)} ${lang.toWord} ${formatDatePart(parsed.end, lang)}`;
    case "unparsed":
      return null;
  }
}

/**
 * The one-stop entry point for a UI call site: parses `text` once and
 * returns both the ISO bounds to persist and the normalized text to show —
 * saves computing the same parse twice for a single field (once for the
 * live preview, once for the submit payload).
 */
export function resolveHistoricalDate(
  text: string,
  language: Language = "en",
): {
  earliest: string | null;
  latest: string | null;
  display: string | null;
} {
  const parsed = parseHistoricalDateDetailed(text, language);
  return { ...boundsOf(parsed), display: formatHistoricalDate(parsed, language) };
}

function boundsOf(parsed: ParsedHistoricalDate): {
  earliest: string | null;
  latest: string | null;
} {
  switch (parsed.kind) {
    case "exact":
    case "about":
      return { earliest: parsed.date.earliest, latest: parsed.date.latest };
    case "before":
      return { earliest: null, latest: parsed.date.latest };
    case "after":
      return { earliest: parsed.date.earliest, latest: null };
    case "between":
    case "from-to":
      return { earliest: parsed.start.earliest, latest: parsed.end.latest };
    case "unparsed":
      return { earliest: null, latest: null };
  }
}

/**
 * The five qualities the date-entry UI offers as a dropdown, front of the
 * date field. A deliberate subset of `ParsedHistoricalDate`'s `kind`: there is
 * no dropdown option for `from-to` (see `splitHistoricalDateText`) or
 * `unparsed` (not a quality anyone would pick — it's what typing produces
 * before it resolves to one of the other five).
 */
export type DateQuality = "exact" | "about" | "before" | "after" | "between";

/**
 * Pulls a date's free-text wording apart into the pieces a quality dropdown +
 * value input(s) UI edits directly — the inverse of `joinHistoricalDateText`.
 * Deliberately more lenient than `parseHistoricalDateDetailed`: it only
 * checks for a qualifier prefix, not whether the remaining text is currently
 * a valid date, so the dropdown doesn't flip back to "Exact" while someone is
 * mid-typing a year. Text in the `from-to` shape ("FROM 1900 TO 1905"), or
 * anything with no recognized qualifier, falls back to `{ quality: "exact",
 * value: <the whole trimmed text> }` — nothing is lost, it just sits in the
 * plain value box until the user edits it through the new controls.
 */
export function splitHistoricalDateText(
  text: string,
  language: Language = "en",
): {
  quality: DateQuality;
  value: string;
  endValue: string;
} {
  const lang = LANGUAGES[language];
  const trimmed = text.trim();
  if (trimmed === "") return { quality: "exact", value: "", endValue: "" };

  const between = lang.between.exec(trimmed);
  if (between) {
    return {
      quality: "between",
      value: (between[1] ?? "").trim(),
      endValue: (between[2] ?? "").trim(),
    };
  }

  const before = lang.before.exec(trimmed);
  if (before) return { quality: "before", value: (before[1] ?? "").trim(), endValue: "" };

  const after = lang.after.exec(trimmed);
  if (after) return { quality: "after", value: (after[1] ?? "").trim(), endValue: "" };

  if (lang.approximate.test(trimmed)) {
    return { quality: "about", value: trimmed.replace(lang.approximate, "").trim(), endValue: "" };
  }

  return { quality: "exact", value: trimmed, endValue: "" };
}

/**
 * Assembles a quality + value(s) back into the free-text wording
 * `parseHistoricalDate`/`resolveDate` already understand — the inverse of
 * `splitHistoricalDateText`. Produces the same wording
 * `formatHistoricalDate` displays ("About 1854", "Between 1900 and 1905"), so
 * it round-trips through the existing parser without any changes there.
 * Returns null rather than a half-formed string when there isn't enough to
 * make a real date yet (an empty value, or — for `between` — either side
 * empty); callers use that directly as their "is this date empty" check.
 */
export function joinHistoricalDateText(
  parts: {
    quality: DateQuality;
    value: string;
    endValue: string;
  },
  language: Language = "en",
): string | null {
  const lang = LANGUAGES[language];
  const value = parts.value.trim();
  if (value === "") return null;

  switch (parts.quality) {
    case "exact":
      return value;
    case "about":
      return `${lang.aboutWord} ${value}`;
    case "before":
      return `${lang.beforeWord} ${value}`;
    case "after":
      return `${lang.afterWord} ${value}`;
    case "between": {
      const endValue = parts.endValue.trim();
      return endValue === "" ? null : `${lang.betweenWord} ${value} ${lang.andWord} ${endValue}`;
    }
  }
}

const ISO_YEAR_MONTH_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const DAY_MONTH_YEAR = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{3,4})$/;
const MONTH_YEAR = /^([A-Za-z]{3,9})\.?\s+(\d{3,4})$/;
const YEAR_ONLY = /^(\d{3,4})$/;

function parseDatePart(text: string, lang: DateLanguage): ParsedDatePart | null {
  const isoYearMonthDay = ISO_YEAR_MONTH_DAY.exec(text);
  if (isoYearMonthDay) {
    const year = Number(isoYearMonthDay[1]);
    const month = Number(isoYearMonthDay[2]);
    const day = Number(isoYearMonthDay[3]);
    if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) return null;
    return dayPart(year, month, day);
  }

  const isoYearMonth = ISO_YEAR_MONTH.exec(text);
  if (isoYearMonth) {
    const year = Number(isoYearMonth[1]);
    const month = Number(isoYearMonth[2]);
    if (month < 1 || month > 12) return null;
    return monthPart(year, month);
  }

  const dayMonthYear = DAY_MONTH_YEAR.exec(text);
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = monthNumber(dayMonthYear[2] ?? "", lang);
    const year = Number(dayMonthYear[3]);
    if (month === null || day < 1 || day > lastDayOfMonth(year, month)) return null;
    return dayPart(year, month, day);
  }

  const monthYear = MONTH_YEAR.exec(text);
  if (monthYear) {
    const month = monthNumber(monthYear[1] ?? "", lang);
    const year = Number(monthYear[2]);
    if (month === null) return null;
    return monthPart(year, month);
  }

  const yearOnly = YEAR_ONLY.exec(text);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    return yearPart(year);
  }

  return null;
}

function dayPart(year: number, month: number, day: number): ParsedDatePart {
  const iso = isoDate(year, month, day);
  return { precision: "day", year, month, day, earliest: iso, latest: iso };
}

function monthPart(year: number, month: number): ParsedDatePart {
  return {
    precision: "month",
    year,
    month,
    day: null,
    earliest: isoDate(year, month, 1),
    latest: isoDate(year, month, lastDayOfMonth(year, month)),
  };
}

function yearPart(year: number): ParsedDatePart {
  return {
    precision: "year",
    year,
    month: null,
    day: null,
    earliest: isoDate(year, 1, 1),
    latest: isoDate(year, 12, 31),
  };
}

function formatDatePart(part: ParsedDatePart, lang: DateLanguage): string {
  if (part.precision === "day" && part.month !== null && part.day !== null) {
    return `${part.day} ${lang.monthNames[part.month - 1]} ${part.year}`;
  }
  if (part.precision === "month" && part.month !== null) {
    return `${lang.monthNames[part.month - 1]} ${part.year}`;
  }
  return `${part.year}`;
}

function monthNumber(name: string, lang: DateLanguage): number | null {
  return lang.months[name.slice(0, 3).toLowerCase()] ?? null;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
