import { z } from "zod";

/**
 * Site-wide display settings, edited by an admin on the Settings page and
 * stored one row per section in `app_settings` (see `@genealogy/db`).
 * Every field has a default, so a section that was never saved — or was
 * saved before a field existed — parses to a complete object; adding a
 * setting needs no migration.
 */
/**
 * The tree page's charts and directions. Plain enums rather than
 * configurable options (see "Configurable dropdown options" in
 * TECH_STACK.md): the code branches on each exact value — each maps to a
 * topola chart class — so the set can't be edited at runtime.
 */
// Hourglass (topola's ancestors-plus-descendants chart) was offered until
// October 2026 and dropped in favour of Relatives, which shows the same and
// adds siblings, aunts/uncles and cousins. A stored or linked "hourglass"
// now falls back to the default — see `parseTreeSettings`.
export const treeChartKindSchema = z.enum(["relatives", "ancestors", "descendants"]);
export type TreeChartKind = z.infer<typeof treeChartKindSchema>;
export const treeOrientationSchema = z.enum(["vertical", "horizontal"]);
export type TreeOrientation = z.infer<typeof treeOrientationSchema>;
/** How much of a date a tree card shows — also structural (it picks the card layout). */
export const treeDateDetailSchema = z.enum(["years", "full"]);
export type TreeDateDetail = z.infer<typeof treeDateDetailSchema>;

export const treeSettingsSchema = z.object({
  /** The ♂/♀ badge over the corner of each card's photo on the tree. */
  showGenderBadge: z.boolean().default(true),
  /** Photos on the cards; off shows initials only (printing, privacy). */
  showPhotos: z.boolean().default(true),
  /** The black band across a deceased person's photo corner. */
  showMourningBand: z.boolean().default(true),
  /** `years`: "* 1850   † 1921" plus a place; `full`: a line per date, place only if there's room. */
  dateDetail: treeDateDetailSchema.default("years"),
  /** What the tree opens with when the link doesn't say — "View in tree", the nav link. */
  defaultChart: treeChartKindSchema.default("relatives"),
  defaultOrientation: treeOrientationSchema.default("vertical"),
  /** Tint the centre person's own ancestors and descendants, so they stand out from aunts, uncles and cousins. */
  highlightDirectLine: z.boolean().default(false),
});
export type TreeSettings = z.infer<typeof treeSettingsSchema>;

export const defaultTreeSettings: TreeSettings = treeSettingsSchema.parse({});

/**
 * Reads a stored tree-settings value field by field: each field that's
 * missing or no longer valid (a choice since removed, like the old
 * "hourglass" chart) takes its default, and every other saved field is
 * kept. Parsing the object as a whole would throw all of them away over
 * one stale value.
 */
export function parseTreeSettings(value: unknown): TreeSettings {
  const stored =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const result: Record<string, unknown> = { ...defaultTreeSettings };
  for (const [key, fieldSchema] of Object.entries(treeSettingsSchema.shape)) {
    const field = fieldSchema.safeParse(stored[key]);
    if (field.success) result[key] = field.data;
  }
  return result as TreeSettings;
}

/** The `app_settings.key` of each section. */
export const appSettingsKeys = { tree: "tree" } as const;
