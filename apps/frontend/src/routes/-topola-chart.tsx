import type { TreeChartKind, TreeSettings } from "@genealogy/core";
import type { JsonGedcomData, TreeCard } from "@genealogy/tree-chart";
import type { ChartPoint, TreeChart } from "@genealogy/tree-chart/chart";
import { Button } from "@genealogy/ui/components/button";
import { MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { exportTree, type TreeExportFormat } from "../lib/tree-export";

export type { ChartPoint } from "@genealogy/tree-chart/chart";

/** The charts the tree page offers — each maps to one topola chart class. */
export type ChartKind = TreeChartKind;

/** What the tree page can ask of the chart. */
export interface TreeChartApi {
  /** Pans (zooming in if far out) to a person's card and returns true; false when they aren't drawn in this chart. */
  focusPerson: (id: string) => boolean;
  /** The whole chart as a file — see `lib/tree-export.ts`. Rejects if the chart isn't drawn yet. */
  exportChart: (format: TreeExportFormat) => Promise<Blob>;
}

/**
 * The tree chart, wrapped for React — the chart itself is
 * `createTreeChart` in `@genealogy/tree-chart`, shared with the static
 * family website. It renders with D3 into a `<div>` this component owns and
 * React never renders inside.
 *
 * Client-only by construction: the chart is loaded with a dynamic `import()`
 * inside an effect, which never runs during SSR — topola is CommonJS-only
 * and needs the DOM.
 *
 * The chart is rebuilt only when the chart kind, orientation, language or
 * animation/initial-zoom setting changes. Everything else — loading more,
 * adding, removing, and a new centre person — is `update` on the same
 * chart, so topola animates cards to their new places.
 */
export function TopolaChart({
  data,
  cards,
  marriages,
  settings,
  rootId,
  chartKind,
  horizontal,
  selectedId,
  apiRef,
  onSelect,
  onCenter,
  onContextMenu,
  canAdd,
  onAddMenu,
}: {
  data: JsonGedcomData;
  /** What each person's card shows, by id. */
  cards: ReadonlyMap<string, TreeCard>;
  /** The marriage line's "⚭ 1874", by `marriageKey`. */
  marriages: ReadonlyMap<string, string>;
  /** Display settings from the Settings page — see `treeSettingsSchema`. */
  settings: TreeSettings;
  rootId: string;
  chartKind: ChartKind;
  horizontal: boolean;
  selectedId: string;
  apiRef?: RefObject<TreeChartApi | null>;
  onSelect: (id: string) => void;
  onCenter: (id: string) => void;
  /** Open the card menu for a person, at this point in the chart (right-click, or the menu key on the selected card). */
  onContextMenu: (id: string, point: ChartPoint) => void;
  /** Draw the "+" add-a-relative button on cards (editors). */
  canAdd: boolean;
  /** A card's "+" was pressed: open the add menu for that person at this point. */
  onAddMenu: (id: string, point: ChartPoint) => void;
}) {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  // The two settings only a new chart picks up — see the effect below.
  const { animateTransitions, initialZoom } = settings;
  const chartRef = useRef<TreeChart | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Latest values for the callbacks the chart holds on to across renders,
  // and for building it once the import resolves.
  const latest = useRef({
    data,
    cards,
    marriages,
    settings,
    rootId,
    canAdd,
    selectedId,
    onSelect,
    onCenter,
    onContextMenu,
    onAddMenu,
    t,
  });
  useEffect(() => {
    latest.current = {
      data,
      cards,
      marriages,
      settings,
      rootId,
      canAdd,
      selectedId,
      onSelect,
      onCenter,
      onContextMenu,
      onAddMenu,
      t,
    };
  });

  useEffect(() => {
    let cancelled = false;
    let chart: TreeChart | null = null;

    void (async () => {
      try {
        const { createTreeChart } = await import("@genealogy/tree-chart/chart");
        const host = hostRef.current;
        if (cancelled || !host) return;
        const props = latest.current;
        chart = createTreeChart(host, {
          data: props.data,
          cards: props.cards,
          marriages: props.marriages,
          settings: { ...props.settings, animateTransitions, initialZoom },
          rootId: props.rootId,
          canAdd: props.canAdd,
          selectedId: props.selectedId,
          chartKind,
          horizontal,
          locale: i18n.language,
          labels: {
            chart: props.t("tree.chartLabel"),
            keyboardHelp: props.t("tree.keyboardHelp"),
            addRelative: (name) => latest.current.t("tree.addMenu.label", { name }),
          },
          onSelect: (id) => latest.current.onSelect(id),
          onCenter: (id) => latest.current.onCenter(id),
          onContextMenu: (id, point) => latest.current.onContextMenu(id, point),
          onAddMenu: (id, point) => latest.current.onAddMenu(id, point),
        });
        chartRef.current = chart;
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      cancelled = true;
      chart?.destroy();
      chartRef.current = null;
    };
    // `data`/`rootId` and the rest are read through `latest`, not listed: a
    // data change or a new centre must not tear down the chart (see the
    // effect below). The initial-zoom setting only matters when it's built.
  }, [chartKind, horizontal, i18n.language, animateTransitions, initialZoom]);

  useEffect(() => {
    chartRef.current?.update({ data, cards, marriages, settings, canAdd, rootId });
  }, [data, cards, marriages, settings, canAdd, rootId]);

  useEffect(() => {
    chartRef.current?.select(selectedId);
  }, [selectedId]);

  // The tree page's handle on the chart (find in tree, export).
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      focusPerson: (id) => chartRef.current?.focusPerson(id) ?? false,
      exportChart: (format) => {
        const source = chartRef.current?.exportSource();
        if (!source) return Promise.reject(new Error(t("tree.export.notReady")));
        const { element, chart, defs, width, height } = source;
        // The export shouldn't carry the on-screen selection outline. Styles
        // are read synchronously at the start of `exportTree`, so the class
        // is only off for that instant; `is-exporting` turns CSS transitions
        // off so the change is visible to the read at once.
        const selected = [...chart.querySelectorAll("g.indi.is-selected")];
        element.classList.add("is-exporting");
        for (const card of selected) card.classList.remove("is-selected");
        const file = exportTree(
          { chart, defs, width, height, background: getComputedStyle(element).backgroundColor },
          format,
        );
        for (const card of selected) card.classList.add("is-selected");
        element.classList.remove("is-exporting");
        return file;
      },
    };
  });

  if (loadError) {
    return (
      <p className="p-4 text-sm text-destructive">
        {t("tree.loadErrorTree", { message: loadError.message })}
      </p>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-md bg-card shadow-sm">
        <Button
          variant="outline"
          size="icon"
          aria-label={t("tree.zoomIn")}
          onClick={() => chartRef.current?.zoomBy(1.25)}
        >
          <ZoomInIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("tree.zoomOut")}
          onClick={() => chartRef.current?.zoomBy(0.8)}
        >
          <ZoomOutIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("tree.fitToView")}
          onClick={() => chartRef.current?.fit()}
        >
          <MaximizeIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
