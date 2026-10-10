import type { HistoricalDate, TreeChartKind, TreeOrientation, TreeSettings } from "@genealogy/core";

/*
 * `data/tree.js` — what the generator hands the tree viewer, as
 * `window.TREE_DATA = {…}`. A script rather than a JSON file because
 * browsers refuse `fetch()` of a local file under `file://`, but a
 * `<script src>` works. Type-only, so both halves (the Node generator and
 * the browser viewer) can import it.
 */

/** One person as the chart draws them — the fields `toTopolaJson`/`treeCard` read, plus display text. */
export interface TreeDataPerson {
  /** `publicId`; their page is `people/<id>.html`. */
  id: string;
  given: string;
  surname: string;
  gender: string;
  isLiving: boolean;
  birth: HistoricalDate | null;
  birthPlace: string | null;
  death: HistoricalDate | null;
  deathPlace: string | null;
  /** Relative to the site root. */
  photoPath: string | null;
  /** Display name, as on their page. */
  name: string;
  /** Birth and death in the site's language — the viewer has no date parser of its own. */
  birthText: string | null;
  deathText: string | null;
  /** "1850–1921", or null. */
  lifespan: string | null;
}

/** The viewer's own text, in the site's language. */
export interface TreeViewerStrings {
  chartLabel: string;
  keyboardHelp: string;
  zoomIn: string;
  zoomOut: string;
  fitToView: string;
  openPage: string;
  centerHere: string;
  charts: Record<TreeChartKind, string>;
  orientations: Record<TreeOrientation, string>;
  loadError: string;
}

export interface TreeData {
  language: string;
  startPersonId: string;
  settings: TreeSettings;
  strings: TreeViewerStrings;
  people: TreeDataPerson[];
  parentEdges: Array<{ parentId: string; childId: string; parentage: string }>;
  spouseEdges: Array<[string, string]>;
}
