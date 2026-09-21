import { resolveHistoricalDate, type HistoricalDate } from "@genealogy/core";

/**
 * Normalizes a stored date to consistent, human-readable wording wherever
 * it's displayed — "1901-03-12", "12 MAR 1901" and "12 March 1901" all read
 * as "12 March 1901". Falls back to the original wording when it can't be
 * parsed, so nothing is ever hidden; returns null only when there's no date
 * at all, for callers to show their own "not recorded" text.
 */
export function formatDisplayDate(date: HistoricalDate | null | undefined): string | null {
  if (!date) return null;
  return resolveHistoricalDate(date.original).display ?? date.original;
}
