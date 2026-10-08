import type { Language } from "./profile.js";

/**
 * A precision-tagged calendar date used inside a `ParsedHistoricalDate` — a
 * single day ("12 MAR 1901"), a month ("MAR 1901"), or a year ("1901"). Each
 * carries its own ISO day bounds so a range built from two parts (`between`,
 * `from-to`) can mix precisions on either side.
 */
export type DatePrecision = "day" | "month" | "year";

/**
 * The calendar a date was *written* in. Gregorian is the default; Julian
 * comes from GEDCOM's `@#DJULIAN@` escape (or GEDCOM 7's `JULIAN` prefix) —
 * Denmark switched in 1700, England in 1752, Russia in 1918, so old records
 * are often Julian. Other GEDCOM calendars (Hebrew, French Republican) aren't
 * parsed: their wording is kept and the date stays `unparsed`.
 */
export type DateCalendar = "gregorian" | "julian";

export interface ParsedDatePart {
  precision: DatePrecision;
  /** The year as written in `calendar` — the later, new-style year when `dualYear` is set. */
  year: number;
  /** null when `precision === "year"`. */
  month: number | null;
  /** null unless `precision === "day"`. */
  day: number | null;
  calendar: DateCalendar;
  /**
   * An old-style/new-style double year exactly as written ("1749/50") — used
   * where the year began on 25 March, so a date between 1 January and
   * 24 March belongs to two year numbers. null otherwise.
   */
  dualYear: string | null;
  /** ISO day bounds, always converted to the Gregorian calendar so every date sorts and compares on one timeline. */
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
  /** Appended to a Julian date's display text. */
  julianSuffix: string;
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
  julianSuffix: "(Julian)",
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
  julianSuffix: "(juliansk)",
};

const LANGUAGES: Record<Language, DateLanguage> = { en: EN, da: DA };

/**
 * Reads the free-text wording a source uses for a date ("abt 1854",
 * "12 MAR 1901", "MAR 1901", "1970-11-18", "bef 1920", "BET 1850 AND 1860",
 * "FROM 1900 TO 1905") into a structured, precision-tagged result. Also reads
 * GEDCOM's Julian calendar escape (`@#DJULIAN@ 3 MAR 1699`, or GEDCOM 7's
 * `JULIAN 3 MAR 1699`) and double years (`11 FEB 1749/50`) — see "GEDCOM
 * export" in TECH_STACK.md.
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
// A year, optionally double-dated: "1749/50" (GEDCOM allows a 1–2 digit suffix).
const YEAR = String.raw`(\d{3,4})(?:\/(\d{1,2}))?`;
const DAY_MONTH_YEAR = new RegExp(String.raw`^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+${YEAR}$`);
const MONTH_YEAR = new RegExp(String.raw`^([A-Za-z]{3,9})\.?\s+${YEAR}$`);
const YEAR_ONLY = new RegExp(String.raw`^${YEAR}$`);
/**
 * GEDCOM 5.5.1's `@#DJULIAN@`-style escape or GEDCOM 7's bare `JULIAN`
 * keyword, at the start of one date part (each side of a `BET … AND …` can
 * carry its own).
 */
const CALENDAR_PREFIX = /^(?:@#D([A-Z ]+)@|(GREGORIAN|JULIAN|HEBREW|FRENCH_R)(?=\s))\s*/i;

function parseDatePart(text: string, lang: DateLanguage): ParsedDatePart | null {
  let calendar: DateCalendar = "gregorian";
  let rest = text;
  const prefix = CALENDAR_PREFIX.exec(text);
  if (prefix) {
    const name = (prefix[1] ?? prefix[2] ?? "").toUpperCase().replace(" ", "_");
    if (name === "JULIAN") calendar = "julian";
    // Hebrew and French Republican dates keep their wording, unparsed.
    else if (name !== "GREGORIAN") return null;
    rest = text.slice(prefix[0].length);
  }

  // ISO forms are this app's own input format — always Gregorian, never double-dated.
  if (calendar === "gregorian") {
    const isoYearMonthDay = ISO_YEAR_MONTH_DAY.exec(rest);
    if (isoYearMonthDay) {
      const year = Number(isoYearMonthDay[1]);
      const month = Number(isoYearMonthDay[2]);
      const day = Number(isoYearMonthDay[3]);
      if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month, calendar)) {
        return null;
      }
      return dayPart(year, month, day, calendar, null);
    }

    const isoYearMonth = ISO_YEAR_MONTH.exec(rest);
    if (isoYearMonth) {
      const year = Number(isoYearMonth[1]);
      const month = Number(isoYearMonth[2]);
      if (month < 1 || month > 12) return null;
      return monthPart(year, month, calendar, null);
    }
  }

  const dayMonthYear = DAY_MONTH_YEAR.exec(rest);
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = monthNumber(dayMonthYear[2] ?? "", lang);
    const year = readYear(dayMonthYear[3], dayMonthYear[4]);
    if (month === null || year === null) return null;
    if (day < 1 || day > lastDayOfMonth(year.year, month, calendar)) return null;
    return dayPart(year.year, month, day, calendar, year.dualYear);
  }

  const monthYear = MONTH_YEAR.exec(rest);
  if (monthYear) {
    const month = monthNumber(monthYear[1] ?? "", lang);
    const year = readYear(monthYear[2], monthYear[3]);
    if (month === null || year === null) return null;
    return monthPart(year.year, month, calendar, year.dualYear);
  }

  const yearOnly = YEAR_ONLY.exec(rest);
  if (yearOnly) {
    const year = readYear(yearOnly[1], yearOnly[2]);
    return year ? yearPart(year.year, calendar, year.dualYear) : null;
  }

  return null;
}

/**
 * A year group, resolving a double year ("1749/50") to the later, new-style
 * year it means (1750) — the suffix must be that year's last digits, so
 * "1749/51" is rejected rather than guessed at.
 */
function readYear(
  first: string | undefined,
  suffix: string | undefined,
): { year: number; dualYear: string | null } | null {
  const year = Number(first);
  if (suffix === undefined) return { year, dualYear: null };
  const next = year + 1;
  if (!String(next).endsWith(suffix)) return null;
  return { year: next, dualYear: `${first}/${suffix}` };
}

function dayPart(
  year: number,
  month: number,
  day: number,
  calendar: DateCalendar,
  dualYear: string | null,
): ParsedDatePart {
  const iso = isoDateIn(calendar, year, month, day);
  return { precision: "day", year, month, day, calendar, dualYear, earliest: iso, latest: iso };
}

function monthPart(
  year: number,
  month: number,
  calendar: DateCalendar,
  dualYear: string | null,
): ParsedDatePart {
  return {
    precision: "month",
    year,
    month,
    day: null,
    calendar,
    dualYear,
    earliest: isoDateIn(calendar, year, month, 1),
    latest: isoDateIn(calendar, year, month, lastDayOfMonth(year, month, calendar)),
  };
}

function yearPart(year: number, calendar: DateCalendar, dualYear: string | null): ParsedDatePart {
  return {
    precision: "year",
    year,
    month: null,
    day: null,
    calendar,
    dualYear,
    earliest: isoDateIn(calendar, year, 1, 1),
    latest: isoDateIn(calendar, year, 12, 31),
  };
}

function formatDatePart(part: ParsedDatePart, lang: DateLanguage): string {
  const year = part.dualYear ?? String(part.year);
  const text =
    part.precision === "day" && part.month !== null && part.day !== null
      ? `${part.day} ${lang.monthNames[part.month - 1]} ${year}`
      : part.precision === "month" && part.month !== null
        ? `${lang.monthNames[part.month - 1]} ${year}`
        : year;
  return part.calendar === "julian" ? `${text} ${lang.julianSuffix}` : text;
}

function monthNumber(name: string, lang: DateLanguage): number | null {
  return lang.months[name.slice(0, 3).toLowerCase()] ?? null;
}

function lastDayOfMonth(year: number, month: number, calendar: DateCalendar): number {
  // The Julian calendar's only difference that matters here: every fourth
  // year is a leap year, centuries included (1700 had a 29 February).
  if (calendar === "julian" && month === 2) return year % 4 === 0 ? 29 : 28;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The ISO (Gregorian) day for a date written in `calendar`. */
function isoDateIn(calendar: DateCalendar, year: number, month: number, day: number): string {
  if (calendar === "gregorian") return isoDate(year, month, day);
  return isoDateFromDayNumber(julianDayNumber(year, month, day));
}

/** Julian Day Number of a Julian-calendar date — the standard integer formula. */
function julianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
}

/** The Gregorian ISO date for a Julian Day Number. */
function isoDateFromDayNumber(dayNumber: number): string {
  const a = dayNumber + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return isoDate(year, month, day);
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
