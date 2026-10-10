import type {
  Gender,
  HistoricalDate,
  Language,
  ThemeDefinition,
  TreeSettings,
} from "@genealogy/core";

/*
 * What `buildSite` is given: the whole tree, gathered by apps/backend, with
 * every configurable-option key already turned into its label (the site
 * can't look them up). Ids are people's `publicId`s, never database UUIDs —
 * they become file names (`people/<id>.html`) and stay the same across
 * exports, so links into a re-published site keep working.
 */

/** Evidence for one fact, as the person page lists it. */
export interface SiteCitation {
  sourceId: string;
  page: string | null;
  volume: string | null;
  entryId: string | null;
  certificateNumber: string | null;
  /** The confidence option's label ("High", "Høj"). */
  confidence: string;
  note: string | null;
}

/** An alternate name — birth name, married name, a spelling found in a record. */
export interface SiteName {
  typeLabel: string;
  given: string;
  surname: string;
  since: HistoricalDate | null;
  notes: string | null;
  citations: SiteCitation[];
}

export interface SiteEvent {
  /** The option key — "birth" and "death" are read as the vitals. */
  eventType: string;
  typeLabel: string;
  /** An "other" event's own name. */
  label: string | null;
  date: HistoricalDate | null;
  place: string | null;
  details: Record<string, string> | null;
  notes: string | null;
  citations: SiteCitation[];
}

export interface SitePerson {
  /** The person's `publicId`. */
  id: string;
  given: string;
  surname: string;
  titlePrefix: string | null;
  suffix: string | null;
  gender: Gender;
  isLiving: boolean;
  /** The profile photo's path inside the site (`assets/photos/…`), or null. The caller copies the file there. */
  photo: string | null;
  notes: string | null;
  names: SiteName[];
  /** Every event, birth and death included. */
  events: SiteEvent[];
  /** Evidence for the person as a whole rather than one fact. */
  citations: SiteCitation[];
}

export interface SiteUnion {
  partnerIds: [string, string];
  statusLabel: string;
  startDate: HistoricalDate | null;
  startPlace: string | null;
  endDate: HistoricalDate | null;
  endPlace: string | null;
  notes: string | null;
  citations: SiteCitation[];
}

export interface SiteSource {
  id: string;
  title: string;
  author: string | null;
  publication: string | null;
  sourceType: string | null;
  repository: string | null;
  callNumber: string | null;
}

export interface SiteParentEdge {
  parentId: string;
  childId: string;
  /** The parentage key — the chart prefers "birth" (see `chosenParents`). */
  parentage: string;
  parentageLabel: string;
}

export interface SiteData {
  title: string;
  /** ISO timestamp, shown on every page. */
  exportedAt: string;
  language: Language;
  /** Who the tree opens on; null → the first person A–Z. */
  startPersonId: string | null;
  treeSettings: TreeSettings;
  /** The family site's theme: colors light and dark, fonts, radius. */
  theme: ThemeDefinition;
  people: SitePerson[];
  parentEdges: SiteParentEdge[];
  spouseEdges: Array<[string, string]>;
  unions: SiteUnion[];
  sources: SiteSource[];
}

/** A generated file's contents, by its path inside the site. */
export type SiteFiles = Map<string, string>;
