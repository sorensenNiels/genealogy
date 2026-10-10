/*
 * The DOM-free half of the tree chart: our data → topola's JSON, what each
 * card shows, and arrow-key navigation. Safe to import anywhere, SSR
 * included. The chart itself (topola + d3, which need the DOM and are
 * CommonJS) is the separate `@genealogy/tree-chart/chart` entry, loaded
 * with a dynamic `import()` in the browser.
 */
export {
  chosenParents,
  directLine,
  marriageKey,
  marriageLabel,
  toTopolaJson,
  treeCard,
  type TopolaConversionOptions,
  type TopolaSourcePerson,
  type TopolaSourceTree,
  type TreeCard,
  type TreeCardOptions,
} from "./topola-data";
export { ARROW_DIRECTIONS, nearestCard, type Point } from "./tree-navigation";
export type { JsonGedcomData } from "topola";
