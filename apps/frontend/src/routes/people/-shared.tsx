/**
 * `LabeledField` and `RemoveButton` used to live here too; they moved to
 * `@genealogy/ui/components/` once `profile.tsx`, `people/index.tsx` and
 * `settings.tsx` needed the same wrappers outside this route folder. The
 * `HistoricalDateInput` preview helpers moved to `../../lib/format-date.ts`
 * once the photo album date field (outside this route folder too) needed
 * them — re-exported here so every existing import from this file keeps
 * working unchanged.
 */
export { historicalDateFieldPreview, historicalDatePreview } from "../../lib/format-date";
