import { Button } from "@genealogy/ui/components/button";
import { MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChartHandle, JsonGedcomData } from "topola";

import {
  CARD_RADIUS,
  createCardRendererClass,
  PHOTO_CLIP,
  PHOTO_CLIP_ID,
  TEXT_CLIP,
  TEXT_CLIP_ID,
  type CardInfo,
} from "./-tree-card-renderer";

/** The charts the tree page offers — each maps to one topola chart class. */
export type ChartKind = "hourglass" | "relatives" | "ancestors" | "descendants";

const MIN_SCALE = 0.1;
const MAX_SCALE = 2;
/** Room left around the chart when fitting it to the canvas. */
const FIT_PADDING = 40;

interface ZoomControls {
  zoomBy: (factor: number) => void;
  fit: () => void;
}

/**
 * Topola's chart, wrapped for React. Topola renders with D3 straight into an
 * `<svg>` it finds by selector, so this component owns that piece of DOM and
 * React never renders inside it.
 *
 * Client-only by construction: topola and d3 are loaded with a dynamic
 * `import()` inside an effect, which never runs during SSR — topola is
 * CommonJS-only and needs the DOM.
 *
 * The boxes are our own cards (`-tree-card-renderer.ts`), not topola's
 * built-in renderers; topola still does the family layout and the lines.
 *
 * Layout: an outer `<svg>` fills the canvas and carries d3-zoom (topola has
 * no pan/zoom of its own); inside it, a `<g>` takes the zoom transform and
 * holds the `<svg>` topola draws into. Topola sets that inner svg's size and
 * its own `<g>`'s translate, so the zoom can't live on either of those.
 *
 * The chart is recreated when the chart kind or orientation changes, and
 * fitted to the canvas then. A data change (load more, add, remove) only
 * calls `setData` + `render`, so topola animates the change and the user's
 * pan/zoom is kept.
 */
export function TopolaChart({
  data,
  cards,
  rootId,
  chartKind,
  horizontal,
  selectedId,
  onSelect,
  onCenter,
}: {
  data: JsonGedcomData;
  /** What each person's card shows, by id. */
  cards: ReadonlyMap<string, CardInfo>;
  rootId: string;
  chartKind: ChartKind;
  horizontal: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onCenter: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  // useId's ":r1:" form isn't a valid CSS id selector, which topola needs.
  const svgId = `topola-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const outerRef = useRef<SVGSVGElement>(null);
  const handleRef = useRef<ChartHandle | null>(null);
  const controlsRef = useRef<ZoomControls | null>(null);
  // Marks the root and selected boxes; set once d3 has loaded. Called after
  // every topola render, since a render can recreate the boxes.
  const highlightRef = useRef<((selectedId: string) => void) | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Latest values for callbacks topola and d3 hold on to across renders.
  const latest = useRef({ data, cards, rootId, selectedId, onSelect, onCenter });
  useEffect(() => {
    latest.current = { data, cards, rootId, selectedId, onSelect, onCenter };
  });

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      try {
        const [topola, { select }, { zoom, zoomIdentity }] = await Promise.all([
          import("topola"),
          import("d3-selection"),
          import("d3-zoom"),
        ]);
        const outer = outerRef.current;
        if (cancelled || !outer) return;

        const chartType = {
          hourglass: topola.HourglassChart,
          relatives: topola.RelativesChart,
          ancestors: topola.AncestorChart,
          descendants: topola.DescendantChart,
        }[chartKind];
        const handle = topola.createChart({
          json: latest.current.data,
          chartType,
          renderer: createCardRendererClass(topola, select, (id) => latest.current.cards.get(id)),
          svgSelector: `#${svgId}`,
          horizontal,
          animate: true,
          updateSvgSize: true,
          locale: i18n.language,
          indiCallback: ({ id }) => latest.current.onSelect(id),
        });

        const outerSelection = select(outer);
        const zoomLayer = select(outer).select<SVGGElement>("g.zoom-layer");
        const zoomBehavior = zoom<SVGSVGElement, unknown>()
          .scaleExtent([MIN_SCALE, MAX_SCALE])
          .on("zoom", (event) => zoomLayer.attr("transform", event.transform.toString()));
        // Double-click centres the tree on a person (below), so it mustn't
        // also zoom.
        outerSelection.call(zoomBehavior).on("dblclick.zoom", null);

        let size: [number, number] = [0, 0];
        const fit = () => {
          const { width, height } = outer.getBoundingClientRect();
          if (size[0] === 0 || size[1] === 0 || width === 0 || height === 0) return;
          const scale = Math.max(
            MIN_SCALE,
            Math.min(
              MAX_SCALE,
              1,
              (width - FIT_PADDING * 2) / size[0],
              (height - FIT_PADDING * 2) / size[1],
            ),
          );
          const x = (width - size[0] * scale) / 2;
          const y = (height - size[1] * scale) / 2;
          outerSelection.call(zoomBehavior.transform, zoomIdentity.translate(x, y).scale(scale));
        };
        controlsRef.current = {
          zoomBy: (factor) => outerSelection.call(zoomBehavior.scaleBy, factor),
          fit,
        };

        // One listener on the inner svg rather than one per box: topola
        // recreates boxes on every render.
        const innerSelection = select<SVGSVGElement, unknown>(`#${svgId}`);
        innerSelection.on("dblclick", (event: MouseEvent) => {
          const box = (event.target as Element).closest("g.indi");
          const datum = box ? (select(box).datum() as { indi?: { id: string } }) : null;
          if (datum?.indi) latest.current.onCenter(datum.indi.id);
        });

        highlightRef.current = (selected) => {
          const root = latest.current.rootId;
          innerSelection
            .selectAll<SVGGElement, { indi: { id: string } }>("g.indi")
            .classed("is-root", (box) => box.indi.id === root)
            .classed("is-selected", (box) => box.indi.id === selected && box.indi.id !== root);
        };

        const info = handle.render({ startIndi: latest.current.rootId });
        size = info.size;
        handleRef.current = handle;
        fit();
        highlightRef.current(latest.current.selectedId);

        cleanup = () => {
          outerSelection.on(".zoom", null);
          innerSelection.on("dblclick", null);
          innerSelection.selectAll("*").remove();
          handleRef.current = null;
          controlsRef.current = null;
          highlightRef.current = null;
        };
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // `data`/`rootId` are read through `latest`, not listed: a data change
    // must not tear down the chart (see the effect below).
  }, [chartKind, horizontal, svgId, i18n.language]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setData(data);
    handle.render({ startIndi: rootId });
    highlightRef.current?.(latest.current.selectedId);
  }, [data, rootId]);

  useEffect(() => {
    highlightRef.current?.(selectedId);
  }, [selectedId]);

  if (loadError) {
    return (
      <p className="p-4 text-sm text-destructive">
        {t("tree.loadErrorTree", { message: loadError.message })}
      </p>
    );
  }

  return (
    <div className="topola-chart relative h-full w-full">
      <svg ref={outerRef} className="h-full w-full cursor-grab active:cursor-grabbing">
        {/* Shared by every card — each card's own coordinates, so one each. */}
        <defs>
          <clipPath id={TEXT_CLIP_ID}>
            <rect {...TEXT_CLIP} />
          </clipPath>
          <clipPath id={PHOTO_CLIP_ID}>
            <rect {...PHOTO_CLIP} rx={CARD_RADIUS} />
          </clipPath>
        </defs>
        <g className="zoom-layer">
          <svg id={svgId} overflow="visible" />
        </g>
      </svg>
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-md bg-card shadow-sm">
        <Button
          variant="outline"
          size="icon"
          aria-label={t("tree.zoomIn")}
          onPress={() => controlsRef.current?.zoomBy(1.25)}
        >
          <ZoomInIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("tree.zoomOut")}
          onPress={() => controlsRef.current?.zoomBy(0.8)}
        >
          <ZoomOutIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("tree.fitToView")}
          onPress={() => controlsRef.current?.fit()}
        >
          <MaximizeIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
