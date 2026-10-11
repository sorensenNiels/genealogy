import { z } from "zod";

import { BUILT_IN_CENSUS_COUNTRIES, censusDefinitionSchema } from "./census.js";
import { canEdit, isAdmin, type MemberRole } from "./membership.js";
import {
  peopleListColumnSchema,
  peopleListGroupingSchema,
  personListSortSchema,
  sortDirectionSchema,
} from "./person-list.js";
import { personIdSchema, personNameFormatSchema } from "./person.js";
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
  /** "Grandfather", "Cousin", "Farbror" under each name — how they're related to the centre person. */
  showRelationshipLabels: z.boolean().default(true),
  /** "⚭ 1874" on the line between partners, from their union's start date. */
  showMarriageYear: z.boolean().default(true),
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

/**
 * The person page's cards. The column each sits in is fixed — Family and
 * External IDs in the narrow one, the rest in the main one — so an order
 * only says which comes first within a column.
 */
export const personCardSchema = z.enum([
  "details",
  "photos",
  "lifeEvents",
  "records",
  "citations",
  "associations",
  "researchNotes",
  "family",
  "externalIds",
]);
export type PersonCard = z.infer<typeof personCardSchema>;

/** Cards that can't be hidden: the person's own facts and their family are what the page is. */
export const ALWAYS_SHOWN_PERSON_CARDS: readonly PersonCard[] = ["details", "family"];

export const PERSON_SIDE_CARDS: readonly PersonCard[] = ["family", "externalIds"];

/**
 * The cards to show, in order: the saved order with duplicates dropped and
 * any card it doesn't mention (one added since it was saved) appended where
 * the default order has it last, minus the hidden ones.
 */
export function orderedPersonCards(
  settings: Pick<PersonSettings, "cardOrder" | "hiddenCards">,
): PersonCard[] {
  const order = [...new Set([...settings.cardOrder, ...personCardSchema.options])];
  const hidden = new Set(settings.hiddenCards);
  return order.filter((card) => ALWAYS_SHOWN_PERSON_CARDS.includes(card) || !hidden.has(card));
}

/**
 * How much of a living person a Viewer sees. Structural, not a configurable
 * option: the redactor branches on each value.
 */
export const viewerLivingDetailSchema = z.enum(["name", "nameAndBirthYear", "hidden"]);
export type ViewerLivingDetail = z.infer<typeof viewerLivingDetailSchema>;

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
  /** The cards in the order the page stacks them, each within its own column — see `orderedPersonCards`. */
  cardOrder: z.array(personCardSchema).default([...personCardSchema.options]),
  /** Cards a family that doesn't use them can leave off. Personal details and Family are always shown. */
  hiddenCards: z.array(personCardSchema).default([]),
  /**
   * How a person's name reads everywhere in the app, not just on this page
   * ("Anders Jensen", "JENSEN, Anders", "Anders JENSEN") — `formatPersonName`
   * takes it. It lives in this section because the person page is where a
   * name is most at home; the static site and backend messages keep the
   * plain form.
   */
  nameFormat: personNameFormatSchema.default("givenFirst"),
  /** Dates on the person page — header, Life events, Family — in full or as years only. */
  dateDetail: treeDateDetailSchema.default("full"),
  /** The person's age at each life event, and the age in the header. */
  showAges: z.boolean().default(true),
  /** Siblings who share only one parent, marked "half". Off lists full siblings only. */
  showHalfSiblings: z.boolean().default(true),
  /** Step-parents (a parent's other spouses), step-siblings and step-children, worked out from marriages. */
  showStepRelations: z.boolean().default(false),
  /** Parents-in-law, brothers- and sisters-in-law, and children's spouses. */
  showInLaws: z.boolean().default(false),
  /**
   * What a Viewer sees of someone living (see `isRedactedFor`): the name
   * only, the name and birth year, or nothing — "Living person" in the
   * tree and Family card, and left out of the People list. Enforced by
   * `PersonRedactor` on the server.
   */
  viewerLivingDetail: viewerLivingDetailSchema.default("name"),
});
export type PersonSettings = z.infer<typeof personSettingsSchema>;

export const defaultPersonSettings: PersonSettings = personSettingsSchema.parse({});

export function parsePersonSettings(value: unknown): PersonSettings {
  return parseSettingsSection(personSettingsSchema, defaultPersonSettings, value);
}

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

/** The People list's two layouts. */
export const peopleListViewSchema = z.enum(["table", "card"]);
export type PeopleListView = z.infer<typeof peopleListViewSchema>;

/** One line per person, or a second line of family context (parents, spouses) and places under the dates. */
export const peopleListRowDetailSchema = z.enum(["compact", "detailed"]);
export type PeopleListRowDetail = z.infer<typeof peopleListRowDetailSchema>;

/**
 * The People list's defaults — the Settings page's "People list" section.
 * Defaults only: a member's own sort and filters live in the page's URL,
 * and their table/card and compact/detailed choices are remembered on their
 * profile (`peopleListPreferencesSchema`), taking precedence over
 * `defaultView`/`defaultRowDetail`. What the detailed line holds is the
 * site's call, not each member's.
 */
export const peopleListSettingsSchema = z.object({
  /** What the list is sorted by when the URL doesn't say — in a patronymic tree, birth date can read better than last name. */
  defaultSort: personListSortSchema.default("surname"),
  defaultSortDirection: sortDirectionSchema.default("asc"),
  /** Table or cards, for a member who hasn't picked one yet. */
  defaultView: peopleListViewSchema.default("table"),
  /** The Born and Died columns: full dates, or just the years (like the tree's `dateDetail`). */
  dateDetail: treeDateDetailSchema.default("full"),
  /** One line per person or two, for a member who hasn't chosen. */
  defaultRowDetail: peopleListRowDetailSchema.default("detailed"),
  /** In detailed rows: "Son of Jens Pedersen & Ane Nielsdatter" under the name — what tells ten Jens Jensens apart. */
  detailParents: z.boolean().default(true),
  /** In detailed rows: "⚭ 1874 Maren Hansdatter" under the name. */
  detailSpouses: z.boolean().default(true),
  /** In detailed rows: the place under the Born and Died dates, instead of a Place column. */
  detailPlaces: z.boolean().default(true),
  /** What the list is grouped by when the URL doesn't say. */
  defaultGrouping: peopleListGroupingSchema.default("none"),
  /** The table columns shown to a member who hasn't chosen their own. */
  defaultColumns: z.array(peopleListColumnSchema).default([...peopleListColumnSchema.options]),
});
export type PeopleListSettings = z.infer<typeof peopleListSettingsSchema>;

export const defaultPeopleListSettings: PeopleListSettings = peopleListSettingsSchema.parse({});

export function parsePeopleListSettings(value: unknown): PeopleListSettings {
  return parseSettingsSection(peopleListSettingsSchema, defaultPeopleListSettings, value);
}

/**
 * A member's own People list choices, saved on their profile
 * (`user_profiles.people_list_preferences`, one JSON value so a new choice
 * needs no migration). Every key is optional: unset means the site's
 * default from `PeopleListSettings`.
 */
export const peopleListPreferencesSchema = z.object({
  view: peopleListViewSchema.optional(),
  rowDetail: peopleListRowDetailSchema.optional(),
  /** The table columns this member shows, over `defaultColumns`. */
  columns: z.array(peopleListColumnSchema).optional(),
});
export type PeopleListPreferences = z.infer<typeof peopleListPreferencesSchema>;

/**
 * A change to a member's choices: a value sets it, null forgets it (back to
 * the site's default) — `undefined` can't do that, since it doesn't survive
 * the trip as JSON.
 */
export const peopleListPreferencesChangeSchema = z.object({
  view: peopleListViewSchema.nullable().optional(),
  rowDetail: peopleListRowDetailSchema.nullable().optional(),
  columns: z.array(peopleListColumnSchema).nullable().optional(),
});
export type PeopleListPreferencesChange = z.infer<typeof peopleListPreferencesChangeSchema>;

/** `preferences` with `change` applied — the backend's save and the page's optimistic update both use it. */
export function applyPeopleListPreferencesChange(
  preferences: PeopleListPreferences,
  change: PeopleListPreferencesChange,
): PeopleListPreferences {
  const result: Record<string, unknown> = { ...preferences };
  for (const [key, value] of Object.entries(change)) {
    if (value === null) delete result[key];
    else if (value !== undefined) result[key] = value;
  }
  return result as PeopleListPreferences;
}

/** Field by field, like the settings sections: a value no longer valid is just dropped. */
export function parsePeopleListPreferences(value: unknown): PeopleListPreferences {
  const stored =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(peopleListPreferencesSchema.shape)) {
    const field = fieldSchema.safeParse(stored[key]);
    if (field.success && field.data !== undefined) result[key] = field.data;
  }
  return result as PeopleListPreferences;
}

/**
 * The Overview's cards — the landing page — in their default order: about
 * the member first, then the family, then research (editors), then upkeep
 * (admins). The People count, Backend and Photo library cards of the first
 * version are folded into "The family at a glance" and "System status".
 */
export const overviewCardSchema = z.enum([
  "yourPlace",
  "continue",
  "onThisDay",
  "featuredAncestor",
  "familyAtAGlance",
  "topPlaces",
  "researchTodo",
  "censusGaps",
  "recentChanges",
  "thingsToLook",
  "system",
]);
export type OverviewCard = z.infer<typeof overviewCardSchema>;

/**
 * Who each card is for: the family cards for everyone, the research cards
 * for those who can edit, upkeep for admins. Their data is gated the same
 * way on the server (`editorProcedure`/`adminProcedure`); this only keeps a
 * card off a page whose member couldn't load it.
 */
export const OVERVIEW_CARD_ROLE: Record<OverviewCard, "member" | "editor" | "admin"> = {
  yourPlace: "member",
  continue: "member",
  onThisDay: "member",
  featuredAncestor: "member",
  familyAtAGlance: "member",
  topPlaces: "member",
  researchTodo: "editor",
  censusGaps: "editor",
  recentChanges: "editor",
  thingsToLook: "admin",
  system: "admin",
};

export function overviewCardAllowed(card: OverviewCard, role: MemberRole): boolean {
  const needs = OVERVIEW_CARD_ROLE[card];
  return needs === "member" || (needs === "editor" ? canEdit(role) : isAdmin(role));
}

/** What "On this day" can list. */
export const onThisDayEventSchema = z.enum(["birth", "marriage", "death"]);
export type OnThisDayEvent = z.infer<typeof onThisDayEventSchema>;

/**
 * Card keys from stored JSON, one at a time: a card that no longer exists
 * is dropped rather than throwing the whole list away, duplicates too.
 */
function parseCardList<T extends string>(schema: z.ZodEnum<Record<T, T>>, value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const cards = value.flatMap((item) => {
    const card = schema.safeParse(item);
    return card.success ? [card.data as T] : [];
  });
  return [...new Set(cards)];
}

/**
 * The Overview — the Settings page's "Overview" section: which cards show
 * and in what order, for every member. Each member can hide cards for
 * themselves on top of this (`OverviewPreferences`), but not bring back one
 * the site hides.
 */
export const overviewSettingsSchema = z.object({
  cardOrder: z.array(overviewCardSchema).default([...overviewCardSchema.options]),
  hiddenCards: z.array(overviewCardSchema).default([]),
  /** Which events "On this day" lists — births include baptisms, deaths burials. */
  onThisDayEvents: z.array(onThisDayEventSchema).default([...onThisDayEventSchema.options]),
  /**
   * Living people's birthdays too, for editors and admins. Never for a
   * Viewer: a living person's birth date is exactly what redaction hides.
   */
  onThisDayLivingBirthdays: z.boolean().default(false),
});
export type OverviewSettings = z.infer<typeof overviewSettingsSchema>;

export const defaultOverviewSettings: OverviewSettings = overviewSettingsSchema.parse({});

export function parseOverviewSettings(value: unknown): OverviewSettings {
  const stored =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    cardOrder:
      "cardOrder" in stored
        ? parseCardList(overviewCardSchema, stored.cardOrder)
        : defaultOverviewSettings.cardOrder,
    hiddenCards: parseCardList(overviewCardSchema, stored.hiddenCards),
    onThisDayEvents:
      "onThisDayEvents" in stored
        ? parseCardList(onThisDayEventSchema, stored.onThisDayEvents)
        : defaultOverviewSettings.onThisDayEvents,
    onThisDayLivingBirthdays:
      typeof stored.onThisDayLivingBirthdays === "boolean"
        ? stored.onThisDayLivingBirthdays
        : defaultOverviewSettings.onThisDayLivingBirthdays,
  };
}

/**
 * A member's own Overview choices, saved on their profile
 * (`user_profiles.overview_preferences`, one JSON value like the People
 * list's): the cards they've hidden for themselves, and the order they've
 * dragged them into — absent until they do, so they follow the site's.
 */
export const overviewPreferencesSchema = z.object({
  hiddenCards: z.array(overviewCardSchema).default([]),
  cardOrder: z.array(overviewCardSchema).optional(),
});
export type OverviewPreferences = z.infer<typeof overviewPreferencesSchema>;

export function parseOverviewPreferences(value: unknown): OverviewPreferences {
  const stored =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    hiddenCards: parseCardList(overviewCardSchema, stored.hiddenCards),
    ...(Array.isArray(stored.cardOrder)
      ? { cardOrder: parseCardList(overviewCardSchema, stored.cardOrder) }
      : {}),
  };
}

/**
 * The cards the Overview shows, in order: the member's own order if they've
 * arranged them, else the site's — with any card that order doesn't mention
 * (one their role only just got, or one added since) placed as the site's
 * order has it, after the rest — minus what the site hides, what this
 * member hides and what their role isn't for.
 */
export function visibleOverviewCards(
  settings: Pick<OverviewSettings, "cardOrder" | "hiddenCards">,
  preferences: OverviewPreferences,
  role: MemberRole,
): OverviewCard[] {
  const hidden = new Set([...settings.hiddenCards, ...preferences.hiddenCards]);
  return [
    ...new Set([
      ...(preferences.cardOrder ?? []),
      ...settings.cardOrder,
      ...overviewCardSchema.options,
    ]),
  ].filter((card) => !hidden.has(card) && overviewCardAllowed(card, role));
}

/** The `app_settings.key` of each section. */
export const appSettingsKeys = {
  tree: "tree",
  person: "person",
  records: "records",
  peopleList: "peopleList",
  overview: "overview",
  theme: "theme",
} as const;
