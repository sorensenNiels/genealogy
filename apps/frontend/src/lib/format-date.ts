import {
  joinHistoricalDateText,
  resolveHistoricalDate,
  type HistoricalDate,
  type Language,
} from "@genealogy/core";
import type {
  HistoricalDatePreview,
  HistoricalDateQuality,
} from "@genealogy/ui/components/historical-date-input";

/**
 * Normalizes a stored date to consistent, human-readable wording wherever
 * it's displayed — "1901-03-12", "12 MAR 1901" and "12 March 1901" all read
 * as "12 March 1901". Falls back to the original wording when it can't be
 * parsed, so nothing is ever hidden; returns null only when there's no date
 * at all, for callers to show their own "not recorded" text.
 *
 * `language` defaults to `"en"` so every pre-i18n call site keeps working
 * unchanged; a caller that wants Danish wording passes `i18n.language` from
 * `useTranslation()` — plain functions rather than hooks, deliberately, so
 * this also works from a `@tanstack/react-table` cell renderer and other
 * non-component call sites that can't call hooks themselves.
 */
export function formatDisplayDate(
  date: HistoricalDate | null | undefined,
  language: Language = "en",
): string | null {
  if (!date) return null;
  return resolveHistoricalDate(date.original, language).display ?? date.original;
}

/** Shared by every editable `HistoricalDateInput` field — see that component. */
export function historicalDatePreview(
  text: string,
  language: Language = "en",
): HistoricalDatePreview | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const { display } = resolveHistoricalDate(trimmed, language);
  return display ? { text: display, status: "parsed" } : { text: trimmed, status: "unparsed" };
}

/**
 * Same as `historicalDatePreview`, but from a quality dropdown's split parts
 * rather than the raw assembled string — every `HistoricalDateInput` call
 * site holds its date this way, so this is the one they all preview from.
 */
export function historicalDateFieldPreview(
  quality: HistoricalDateQuality,
  value: string,
  endValue: string,
  language: Language = "en",
): HistoricalDatePreview | null {
  return historicalDatePreview(
    joinHistoricalDateText({ quality, value, endValue }, language) ?? "",
    language,
  );
}
