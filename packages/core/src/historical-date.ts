/**
 * Resolves the free-text wording a source uses for a date ("abt 1854",
 * "12 MAR 1901", "MAR 1901", "1970-11-18", "bef 1920 ") into ISO-8601 day
 * bounds — enough to compute an age or sort a list. This is a first pass
 * covering the wordings this app's own date fields actually produce, not the
 * full GEDCOM date grammar (no BET/AND ranges, no double-dating, no calendar
 * escapes yet) — see "GEDCOM import and export" in TECH_STACK.md.
 * Unparseable text returns both bounds null; callers keep the original
 * wording regardless.
 */
export function parseHistoricalDate(text: string): {
  earliest: string | null;
  latest: string | null;
} {
  const trimmed = text.trim();
  if (trimmed === "") return { earliest: null, latest: null };

  const before = BEFORE.exec(trimmed);
  if (before) {
    const bounds = parseExact(before[1] ?? "");
    return bounds ? { earliest: null, latest: bounds.latest } : NOT_PARSED;
  }

  const after = AFTER.exec(trimmed);
  if (after) {
    const bounds = parseExact(after[1] ?? "");
    return bounds ? { earliest: bounds.earliest, latest: null } : NOT_PARSED;
  }

  const body = trimmed.replace(APPROXIMATE, "");
  return parseExact(body) ?? NOT_PARSED;
}

const NOT_PARSED = { earliest: null, latest: null };

const APPROXIMATE = /^(?:abt|about|circa|cal|est|estimated)\.?\s+/i;
const BEFORE = /^(?:bef|before)\.?\s+(.+)$/i;
const AFTER = /^(?:aft|after)\.?\s+(.+)$/i;

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

const ISO_YEAR_MONTH_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const DAY_MONTH_YEAR = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{3,4})$/;
const MONTH_YEAR = /^([A-Za-z]{3,9})\.?\s+(\d{3,4})$/;
const YEAR_ONLY = /^(\d{3,4})$/;

function parseExact(text: string): { earliest: string; latest: string } | null {
  const isoYearMonthDay = ISO_YEAR_MONTH_DAY.exec(text);
  if (isoYearMonthDay) {
    const year = Number(isoYearMonthDay[1]);
    const month = Number(isoYearMonthDay[2]);
    const day = Number(isoYearMonthDay[3]);
    if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) return null;
    const iso = isoDate(year, month, day);
    return { earliest: iso, latest: iso };
  }

  const isoYearMonth = ISO_YEAR_MONTH.exec(text);
  if (isoYearMonth) {
    const year = Number(isoYearMonth[1]);
    const month = Number(isoYearMonth[2]);
    if (month < 1 || month > 12) return null;
    return {
      earliest: isoDate(year, month, 1),
      latest: isoDate(year, month, lastDayOfMonth(year, month)),
    };
  }

  const dayMonthYear = DAY_MONTH_YEAR.exec(text);
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1]);
    const month = monthNumber(dayMonthYear[2] ?? "");
    const year = Number(dayMonthYear[3]);
    if (month === null || day < 1 || day > lastDayOfMonth(year, month)) return null;
    const iso = isoDate(year, month, day);
    return { earliest: iso, latest: iso };
  }

  const monthYear = MONTH_YEAR.exec(text);
  if (monthYear) {
    const month = monthNumber(monthYear[1] ?? "");
    const year = Number(monthYear[2]);
    if (month === null) return null;
    return {
      earliest: isoDate(year, month, 1),
      latest: isoDate(year, month, lastDayOfMonth(year, month)),
    };
  }

  const yearOnly = YEAR_ONLY.exec(text);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    return { earliest: isoDate(year, 1, 1), latest: isoDate(year, 12, 31) };
  }

  return null;
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
