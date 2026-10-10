import type { HistoricalDate, TreeChartKind, TreeOrientation } from "@genealogy/core";
import { directLine, toTopolaJson, treeCard, type TreeCard } from "@genealogy/tree-chart";
import { createTreeChart, type TreeChart } from "@genealogy/tree-chart/chart";

import "@genealogy/tree-chart/tree-chart.css";
import "../site.css";

import type { TreeData } from "../tree-data";

/*
 * The static site's tree page: the app's own chart (`createTreeChart`) over
 * `window.TREE_DATA` (data/tree.js), plus the glue the app's tree page
 * would otherwise provide — the chart/direction switcher, the selected
 * person with a link to their page, "centre here", and the zoom buttons.
 * Everyone is in the data from the start, so there's no loading more.
 *
 * Built into one classic script by vite.config.ts; the CSS imports above
 * become `assets/site.css`, which every page of the site links.
 */

declare global {
  interface Window {
    TREE_DATA?: TreeData;
  }
}

const CHART_KINDS: readonly TreeChartKind[] = ["relatives", "ancestors", "descendants"];
const ORIENTATIONS: readonly TreeOrientation[] = ["vertical", "horizontal"];

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Photo paths are relative to the site root, where tree.html is, so they're used as they are. */
function photoUrl(path: string): string {
  return path;
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

function start(data: TreeData, host: HTMLElement) {
  const { settings, strings } = data;
  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("person");
  let rootId = requested && peopleById.has(requested) ? requested : data.startPersonId;
  let selectedId = rootId;
  let kind = pick(params.get("chart"), CHART_KINDS, settings.defaultChart);
  let orientation = pick(params.get("orientation"), ORIENTATIONS, settings.defaultOrientation);

  // The generator already formatted every date in the site's language; the
  // chart asks for a date by the object it was given, so look it up by that.
  const dateTexts = new Map<HistoricalDate, string>();
  for (const person of data.people) {
    if (person.birth && person.birthText) dateTexts.set(person.birth, person.birthText);
    if (person.death && person.deathText) dateTexts.set(person.death, person.deathText);
  }
  const formatDate = (date: HistoricalDate) => dateTexts.get(date) ?? date.original;

  const json = toTopolaJson(
    { people: data.people, parentEdges: data.parentEdges, spouseEdges: data.spouseEdges },
    { formatDate, photoUrl },
  );
  const cardsAround = (root: string): Map<string, TreeCard> => {
    const line = directLine(root, data.parentEdges);
    return new Map(
      data.people.map((person) => [
        person.id,
        treeCard(person, {
          name: person.name,
          photoUrl,
          formatDate,
          dateDetail: settings.dateDetail,
          isDirectLine: line.has(person.id),
          canLoadParents: false,
          canLoadChildren: false,
        }),
      ]),
    );
  };

  const selectedName = byId("tree-selected-name");
  const selectedLifespan = byId("tree-selected-lifespan");
  const selectedOpen = byId<HTMLAnchorElement>("tree-selected-open");
  const centerButton = byId<HTMLButtonElement>("tree-selected-center");
  const showSelected = () => {
    const person = peopleById.get(selectedId);
    if (!person) return;
    if (selectedName) selectedName.textContent = person.name;
    if (selectedLifespan) selectedLifespan.textContent = person.lifespan ?? "";
    if (selectedOpen) selectedOpen.href = `people/${person.id}.html`;
    if (centerButton) centerButton.hidden = person.id === rootId;
  };

  /** Keeps the address bar in step, so a reload or a copied link opens the same view. Not every browser allows it under `file://`. */
  const saveView = () => {
    try {
      const search = new URLSearchParams({ person: rootId, chart: kind, orientation });
      window.history.replaceState(null, "", `?${search.toString()}`);
    } catch {
      // Only the address bar is left behind; the view itself is fine.
    }
  };

  let chart: TreeChart | null = null;
  const select = (id: string) => {
    selectedId = id;
    chart?.select(id);
    showSelected();
  };
  const center = (id: string) => {
    if (id === rootId || !peopleById.has(id)) return;
    rootId = id;
    chart?.update({ data: json, cards: cardsAround(id), settings, rootId: id, canAdd: false });
    select(id);
    saveView();
  };
  // The chart kind and direction are fixed for a chart's life, so changing
  // either draws a new one.
  const build = () => {
    chart?.destroy();
    chart = createTreeChart(host, {
      data: json,
      cards: cardsAround(rootId),
      settings,
      rootId,
      canAdd: false,
      selectedId,
      chartKind: kind,
      horizontal: orientation === "horizontal",
      locale: data.language,
      labels: {
        chart: strings.chartLabel,
        keyboardHelp: strings.keyboardHelp,
        addRelative: () => "",
      },
      onSelect: select,
      onCenter: center,
    });
  };

  const kindSelect = byId<HTMLSelectElement>("tree-kind");
  const orientationSelect = byId<HTMLSelectElement>("tree-orientation");
  if (kindSelect) {
    kindSelect.value = kind;
    kindSelect.addEventListener("change", () => {
      kind = pick(kindSelect.value, CHART_KINDS, kind);
      build();
      saveView();
    });
  }
  if (orientationSelect) {
    orientationSelect.value = orientation;
    orientationSelect.addEventListener("change", () => {
      orientation = pick(orientationSelect.value, ORIENTATIONS, orientation);
      build();
      saveView();
    });
  }
  centerButton?.addEventListener("click", () => center(selectedId));
  byId("tree-zoom-in")?.addEventListener("click", () => chart?.zoomBy(1.25));
  byId("tree-zoom-out")?.addEventListener("click", () => chart?.zoomBy(0.8));
  byId("tree-fit")?.addEventListener("click", () => chart?.fit());

  build();
  showSelected();
}

function main() {
  const data = window.TREE_DATA;
  const host = byId("tree-chart");
  if (!data || !host || data.people.length === 0) return;
  try {
    start(data, host);
  } catch (error) {
    console.error(error);
    const message = document.createElement("p");
    message.className = "tree-noscript";
    message.textContent = data.strings.loadError;
    host.replaceChildren(message);
  }
}

main();
