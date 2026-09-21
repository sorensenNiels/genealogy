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
export function parseHistoricalDateDetailed(text: string): ParsedHistoricalDate {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "unparsed" };

  const between = BETWEEN.exec(trimmed);
  if (between) {
    const start = parseDatePart((between[1] ?? "").trim());
    const end = parseDatePart((between[2] ?? "").trim());
    return start && end ? { kind: "between", start, end } : { kind: "unparsed" };
  }

  const fromTo = FROM_TO.exec(trimmed);
  if (fromTo) {
    const start = parseDatePart((fromTo[1] ?? "").trim());
    const end = parseDatePart((fromTo[2] ?? "").trim());
    return start && end ? { kind: "from-to", start, end } : { kind: "unparsed" };
  }

  const before = BEFORE.exec(trimmed);
  if (before) {
    const date = parseDatePart((before[1] ?? "").trim());
    return date ? { kind: "before", date } : { kind: "unparsed" };
  }

  const after = AFTER.exec(trimmed);
  if (after) {
    const date = parseDatePart((after[1] ?? "").trim());
    return date ? { kind: "after", date } : { kind: "unparsed" };
  }

  const isApproximate = APPROXIMATE.test(trimmed);
  const date = parseDatePart(trimmed.replace(APPROXIMATE, ""));
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
export function parseHistoricalDate(text: string): {
  earliest: string | null;
  latest: string | null;
} {
  return boundsOf(parseHistoricalDateDetailed(text));
}

/**
 * Turns a parsed date back into normalized, human-readable wording — e.g.
 * "1901-03-12", "12 MAR 1901" and "12 March 1901" all become
 * "12 March 1901". Returns null only for `{ kind: "unparsed" }`; callers fall
 * back to the original typed text in that case, never hiding it.
 */
export function formatHistoricalDate(parsed: ParsedHistoricalDate): string | null {
  switch (parsed.kind) {
    case "exact":
      return formatDatePart(parsed.date);
    case "about":
      return `About ${formatDatePart(parsed.date)}`;
    case "before":
      return `Before ${formatDatePart(parsed.date)}`;
    case "after":
      return `After ${formatDatePart(parsed.date)}`;
    case "between":
      return `Between ${formatDatePart(parsed.start)} and ${formatDatePart(parsed.end)}`;
    case "from-to":
      return `From ${formatDatePart(parsed.start)} to ${formatDatePart(parsed.end)}`;
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
export function resolveHistoricalDate(text: string): {
  earliest: string | null;
  latest: string | null;
  display: string | null;
} {
  const parsed = parseHistoricalDateDetailed(text);
  return { ...boundsOf(parsed), display: formatHistoricalDate(parsed) };
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

const APPROXIMATE = /^(?:abt|about|circa|cal|est|estimated)\.?\s+/i;
const BEFORE = /^(?:bef|before)\.?\s+(.+)$/i;
const AFTER = /^(?:aft|after)\.?\s+(.+)$/i;
const BETWEEN = /^(?:bet|between)\.?\s+(.+?)\s+and\s+(.+)$/i;
const FROM_TO = /^from\s+(.+?)\s+to\s+(.+)$/i;

const MONTHS: Record<string, number> = {
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
};

const MONTH_NAMES = [
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
];

const ISO_YEAR_MONTH_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const DAY_MONTH_YEAR = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{3,4})$/;
const MONTH_YEAR = /^([A-Za-z]{3,9})\.?\s+(\d{3,4})$/;
const YEAR_ONLY = /^(\d{3,4})$/;

function parseDatePart(text: string): ParsedDatePart | null {
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
    const month = monthNumber(dayMonthYear[2] ?? "");
    const year = Number(dayMonthYear[3]);
    if (month === null || day < 1 || day > lastDayOfMonth(year, month)) return null;
    return dayPart(year, month, day);
  }

  const monthYear = MONTH_YEAR.exec(text);
  if (monthYear) {
    const month = monthNumber(monthYear[1] ?? "");
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

function formatDatePart(part: ParsedDatePart): string {
  if (part.precision === "day" && part.month !== null && part.day !== null) {
    return `${part.day} ${MONTH_NAMES[part.month - 1]} ${part.year}`;
  }
  if (part.precision === "month" && part.month !== null) {
    return `${MONTH_NAMES[part.month - 1]} ${part.year}`;
  }
  return `${part.year}`;
}

function monthNumber(name: string): number | null {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? null;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
