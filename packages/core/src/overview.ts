import type { HistoricalDate } from "./person.js";

/**
 * Whether `date` fell on this month and day — only for an exact date (one
 * day, `earliest` = `latest`): "abt 1850" or "Mar 1850" can't say which day,
 * and an "On this day" built on a guess would be wrong more often than not.
 * `month` is 1–12.
 */
export function isOnThisDay(date: HistoricalDate | null, month: number, day: number): boolean {
  if (!date?.earliest || date.earliest !== date.latest) return false;
  const [, mm, dd] = date.earliest.split("-");
  return Number(mm) === month && Number(dd) === day;
}

/** How many years ago an exact date was, from `todayIso` (YYYY-MM-DD) — the anniversary count. */
export function yearsSince(date: HistoricalDate, todayIso: string): number | null {
  if (!date.earliest) return null;
  return Number(todayIso.slice(0, 4)) - Number(date.earliest.slice(0, 4));
}

/**
 * One of `ids` for the day `dayIso`, the same all day for everyone and a
 * different one tomorrow — "Featured ancestor". A small string hash of the
 * day over the sorted ids, so it doesn't depend on the order they came in.
 * Null when there's nobody to pick.
 */
export function pickOfTheDay(ids: readonly string[], dayIso: string): string | null {
  if (ids.length === 0) return null;
  let hash = 0;
  for (const char of dayIso) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const sorted = [...ids].toSorted();
  return sorted[hash % sorted.length]!;
}
