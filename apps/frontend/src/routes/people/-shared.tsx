import { joinHistoricalDateText, resolveHistoricalDate } from "@genealogy/core";
import type {
  HistoricalDatePreview,
  HistoricalDateQuality,
} from "@genealogy/ui/components/historical-date-input";

/**
 * The date-preview helper every `HistoricalDateInput` call site previews
 * from. `LabeledField` and `RemoveButton` used to live here too; they moved
 * to `@genealogy/ui/components/` once `profile.tsx`, `people/index.tsx` and
 * `settings.tsx` needed the same wrappers outside this route folder. Split
 * out so the cards that use it (Names & gender, Birth, Living status &
 * death, Family's sub-sections, Life events) don't each redeclare it.
 */

/** Shared by every date field across these cards — see HistoricalDateInput. */
export function historicalDatePreview(text: string): HistoricalDatePreview | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const { display } = resolveHistoricalDate(trimmed);
  return display ? { text: display, status: "parsed" } : { text: trimmed, status: "unparsed" };
}

/**
 * Same as `historicalDatePreview`, but from a quality dropdown's split parts
 * rather than the raw assembled string — every `HistoricalDateInput` call
 * site holds its date this way now, so this is the one they all preview from.
 */
export function historicalDateFieldPreview(
  quality: HistoricalDateQuality,
  value: string,
  endValue: string,
): HistoricalDatePreview | null {
  return historicalDatePreview(joinHistoricalDateText({ quality, value, endValue }) ?? "");
}
