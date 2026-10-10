import { z } from "zod";

import { BUILT_IN_CENSUS_COUNTRIES, censusDefinitionSchema } from "./census.js";
import { personIdSchema } from "./person.js";
import { recordTypeSchema } from "./records.js";

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

export const treeInitialZoomSchema = z.enum(["fit", "person"]);
export type TreeInitialZoom = z.infer<typeof treeInitialZoomSchema>;

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
  /** The overview of the whole chart in the corner. */
  showMinimap: z.boolean().default(true),
  /** Animate re-centring, loading more, and pans. Off regardless when the browser asks for reduced motion. */
  animateTransitions: z.boolean().default(true),
  /** How a freshly opened tree is zoomed: the whole chart, or 100% on the centre person. */
  initialZoom: treeInitialZoomSchema.default("fit"),
  /** Reopen the tree where each member left it: their last centre person, chart and direction (saved on their profile) and zoom (per browser). */
  rememberLastView: z.boolean().default(true),
});

/** Where a member last had the tree — see `user_profiles.lastTree*`. */
export const lastTreeViewSchema = z.object({
  personId: personIdSchema,
  view: treeChartKindSchema,
  orientation: treeOrientationSchema,
});
export type LastTreeView = z.infer<typeof lastTreeViewSchema>;
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
  return parseSettingsSection(treeSettingsSchema, defaultTreeSettings, value);
}

/**
 * The shared field-by-field read behind `parseTreeSettings` and
 * `parsePersonSettings`: each field that's missing or no longer valid takes
 * its default, every other saved field is kept.
 */
function parseSettingsSection<T extends Record<string, unknown>>(
  schema: z.ZodObject,
  defaults: T,
  value: unknown,
): T {
  const stored =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const field = (fieldSchema as z.ZodType).safeParse(stored[key]);
    if (field.success) result[key] = field.data;
  }
  return result as T;
}

/** The person page's settings — the Settings page's "Person page" section. */
export const personSettingsSchema = z.object({
  /**
   * Open a person's page in edit view (every card's form open) rather than
   * the read view, with an Edit button per card. Viewers always get the read
   * view.
   */
  openInEditMode: z.boolean().default(false),
  /** Children's births and deaths, a spouse's and the parents' deaths, faintly in the person's own Life events timeline. */
  showFamilyEventsInTimeline: z.boolean().default(true),
  /**
   * Someone still marked living whose birth was more than this many years
   * ago is presumed deceased — by the GEDCOM import, by the "Probably
   * deceased" hint in Personal details, and by the Tools action. 0 turns
   * it off. See `isPresumedDeceased`.
   */
  presumeDeceasedAfterYears: z.number().int().min(0).max(200).default(110),
});
export type PersonSettings = z.infer<typeof personSettingsSchema>;

export const defaultPersonSettings: PersonSettings = personSettingsSchema.parse({});

export function parsePersonSettings(value: unknown): PersonSettings {
  return parseSettingsSection(personSettingsSchema, defaultPersonSettings, value);
}

/** The `app_settings.key` of each section. */
/**
 * Records (census, baptism, marriage, burial — see `RECORD_TEMPLATES`): the
 * Settings page's "Records" section.
 */
export const recordSettingsSchema = z.object({
  /** Which record types the "Add record" menus offer. */
  enabledRecordTypes: z.array(recordTypeSchema).default([...recordTypeSchema.options]),
  /** Which countries' censuses the census picker offers (built-in country codes, or a custom census's country). */
  censusCountries: z.array(z.string().trim().min(1)).default([...BUILT_IN_CENSUS_COUNTRIES]),
  /**
   * The countries whose censuses a person's coverage grid lists by default.
   * A person's grid also shows any country they already have a census from,
   * so a family that emigrated shows both.
   */
  coverageCountries: z.array(z.string().trim().min(1)).default(["dk"]),
  /** Censuses beyond the built-in ones — another country, a local count. */
  customCensuses: z.array(censusDefinitionSchema).default([]),
  /** The confidence of the citation each record gives its people (a `confidence` option key). */
  citationConfidence: z.string().trim().min(1).default("high"),
  /**
   * What a record's implied family links do — "suggest": shown on the
   * record for one click each; "automatic": made when the record is saved
   * (never replacing an existing link).
   */
  relationshipLinks: z.enum(["suggest", "automatic"]).default("suggest"),
});
export type RecordSettings = z.infer<typeof recordSettingsSchema>;

export const defaultRecordSettings: RecordSettings = recordSettingsSchema.parse({});

export function parseRecordSettings(value: unknown): RecordSettings {
  return parseSettingsSection(recordSettingsSchema, defaultRecordSettings, value);
}

export const appSettingsKeys = { tree: "tree", person: "person", records: "records" } as const;
