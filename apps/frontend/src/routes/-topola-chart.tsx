import type { TreeChartKind, TreeSettings } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { cn } from "@genealogy/ui/lib/utils";
import { MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { ChartHandle, JsonGedcomData } from "topola";

import { exportTree, type TreeExportFormat } from "../lib/tree-export";
import { ARROW_DIRECTIONS, nearestCard } from "../lib/tree-navigation";
import {
  CARD_HEIGHT,
  CARD_RADIUS,
  CARD_WIDTH,
  createCardRendererClass,
  PHOTO_CLIP,
  PHOTO_CLIP_ID,
  TEXT_CLIP,
  TEXT_CLIP_ID,
  type CardInfo,
  type CardPosition,
  type ExpandDirection,
} from "./-tree-card-renderer";

/** The charts the tree page offers — each maps to one topola chart class. */
export type ChartKind = TreeChartKind;

/** What the tree page can ask of the chart. */
export interface TreeChartApi {
  /** Pans (zooming in if far out) to a person's card and returns true; false when they aren't drawn in this chart. */
  focusPerson: (id: string) => boolean;
  /** The whole chart as a file — see `lib/tree-export.ts`. Rejects if the chart isn't drawn yet. */
  exportChart: (format: TreeExportFormat) => Promise<Blob>;
}

/** A point inside the chart's own box, in CSS pixels from its top-left corner. */
export interface ChartPoint {
  x: number;
  y: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 2;
/** Room left around the chart when fitting it to the canvas. */
const FIT_PADDING = 40;
/** A found or keyboard-selected person is brought to at least this zoom, so their card is readable. */
const FOCUS_SCALE = 0.8;
/** Matches topola's own move animation (HIDE_TIME_MS + MOVE_TIME_MS), so a re-centre pans while the cards rearrange. */
const PAN_MS = 700;
/** A keyboard-selected card closer than this to the canvas edge is panned into view. */
const EDGE_MARGIN = 60;
const MINIMAP_MAX_WIDTH = 200;
const MINIMAP_MAX_HEIGHT = 140;

interface ChartLayout {
  /** Card centres in the zoom layer's coordinates. */
  positions: Map<string, CardPosition>;
  size: [number, number];
}

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

/** The imperative half of the chart, built once topola and d3 have loaded. */
interface ChartControls {
  /** Re-renders with the current data and root; returns the new layout. */
  render: () => ChartLayout;
  zoomBy: (factor: number) => void;
  fit: () => void;
  centerAt: (point: CardPosition, options?: { scale?: number; animate?: boolean }) => void;
  /** Marks the root, the selected card and a loading "+" — after every render, and when those change. */
  highlight: (
    selectedId: string,
    expanding: { id: string; direction: ExpandDirection } | null,
  ) => void;
}

const EMPTY_LAYOUT: ChartLayout = { positions: new Map(), size: [0, 0] };

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
 * The chart is rebuilt only when the chart kind, orientation or animation
 * setting changes. Everything else — loading more, adding, removing, and a
 * new centre person — is `setData` + `render` on the same topola handle, so
 * topola animates cards to their new places; on a new centre the view pans
 * to it at the same time ("smooth re-centring").
 *
 * Navigation built on the card positions the renderer reports: find
 * (`apiRef.focusPerson`), the minimap, and arrow-key movement between cards
 * — the canvas is focusable, and the selected person is announced.
 */
export function TopolaChart({
  data,
  cards,
  settings,
  rootId,
  chartKind,
  horizontal,
  selectedId,
  expanding,
  apiRef,
  onSelect,
  onCenter,
  onExpand,
  onContextMenu,
}: {
  data: JsonGedcomData;
  /** What each person's card shows, by id. */
  cards: ReadonlyMap<string, CardInfo>;
  /** Display settings from the Settings page — see `treeSettingsSchema`. */
  settings: TreeSettings;
  rootId: string;
  chartKind: ChartKind;
  horizontal: boolean;
  selectedId: string;
  /** Whose "+" is loading right now, so it can show a spinner. */
  expanding: { id: string; direction: ExpandDirection } | null;
  apiRef?: RefObject<TreeChartApi | null>;
  onSelect: (id: string) => void;
  onCenter: (id: string) => void;
  onExpand: (id: string, direction: ExpandDirection) => void;
  /** Open the card menu for a person, at this point in the chart (right-click, or the menu key on the selected card). */
  onContextMenu: (id: string, point: ChartPoint) => void;
}) {
  const { t, i18n } = useTranslation();
  // useId's ":r1:" form isn't a valid CSS id selector, which topola needs.
  const svgId = `topola-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const helpId = `${svgId}-help`;
  const outerRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ChartHandle | null>(null);
  const controlsRef = useRef<ChartControls | null>(null);
  // What the card renderer draws from. Updated just before each render (in
  // the data effect) rather than every React render, so it always matches
  // the data drawn.
  const drawInputs = useRef({ cards, settings });
  // The root the chart was last drawn around — a change means re-centre.
  const drawnRoot = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [layout, setLayout] = useState<ChartLayout>(EMPTY_LAYOUT);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [canvasSize, setCanvasSize] = useState<[number, number]>([0, 0]);
  const [announcement, setAnnouncement] = useState("");

  // Latest values for callbacks topola and d3 hold on to across renders.
  const remember = settings.rememberLastView;
  const latest = useRef({
    rootId,
    selectedId,
    expanding,
    data,
    remember,
    onSelect,
    onCenter,
    onExpand,
    onContextMenu,
    t,
  });
  useEffect(() => {
    latest.current = {
      rootId,
      selectedId,
      expanding,
      data,
      remember,
      onSelect,
      onCenter,
      onExpand,
      onContextMenu,
      t,
    };
  });

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      try {
        const [topola, { select }, { zoom, zoomIdentity, zoomTransform }] = await Promise.all([
          import("topola"),
          import("d3-selection"),
          import("d3-zoom"),
          // Adds `.transition()` to d3 selections, for the smooth pans.
          import("d3-transition"),
        ]);
        const outer = outerRef.current;
        if (cancelled || !outer) return;

        // The browser's reduced-motion request wins over the setting.
        const animate =
          settings.animateTransitions &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        let lastPositions = new Map<string, CardPosition>();
        const chartType = {
          relatives: topola.RelativesChart,
          ancestors: topola.AncestorChart,
          descendants: topola.DescendantChart,
        }[chartKind];
        const handle = topola.createChart({
          json: latest.current.data,
          chartType,
          renderer: createCardRendererClass(topola, select, {
            cardFor: (id) => drawInputs.current.cards.get(id),
            settings: () => drawInputs.current.settings,
            onExpand: (id, direction) => latest.current.onExpand(id, direction),
            expandLabel: (id, direction) =>
              latest.current.t(direction === "up" ? "tree.loadParentsOf" : "tree.loadChildrenOf", {
                name: drawInputs.current.cards.get(id)?.name ?? "",
              }),
            onContextMenu: (id, clientX, clientY) => {
              const box = outer.getBoundingClientRect();
              latest.current.onContextMenu(id, { x: clientX - box.left, y: clientY - box.top });
            },
            onPositions: (positions) => {
              lastPositions = positions;
            },
          }),
          svgSelector: `#${svgId}`,
          horizontal,
          animate,
          updateSvgSize: true,
          locale: i18n.language,
          indiCallback: ({ id }) => latest.current.onSelect(id),
        });

        const outerSelection = select(outer);
        const zoomLayer = outerSelection.select<SVGGElement>("g.zoom-layer");
        // Throttled to a frame: the minimap redraws from this.
        let viewFrame = 0;
        const zoomBehavior = zoom<SVGSVGElement, unknown>()
          .scaleExtent([MIN_SCALE, MAX_SCALE])
          .on("zoom", (event) => {
            zoomLayer.attr("transform", event.transform.toString());
            cancelAnimationFrame(viewFrame);
            const { x, y, k } = event.transform;
            viewFrame = requestAnimationFrame(() => setView({ x, y, k }));
          })
          // Remember where the view was left, relative to the centre card —
          // see `saveZoom`.
          .on("end", (event) => saveZoom(event.transform));
        // Double-click centres the tree on a person (below), so it mustn't
        // also zoom.
        outerSelection.call(zoomBehavior).on("dblclick.zoom", null);

        let chartLayout = EMPTY_LAYOUT;
        const setTransform = (
          transform: ReturnType<typeof zoomIdentity.scale>,
          smooth: boolean,
        ) => {
          if (smooth) {
            outerSelection.transition().duration(PAN_MS).call(zoomBehavior.transform, transform);
          } else {
            outerSelection.call(zoomBehavior.transform, transform);
          }
        };
        const fit = () => {
          const { width, height } = outer.getBoundingClientRect();
          const [chartWidth, chartHeight] = chartLayout.size;
          if (chartWidth === 0 || chartHeight === 0 || width === 0 || height === 0) return;
          const scale = Math.max(
            MIN_SCALE,
            Math.min(
              1,
              (width - FIT_PADDING * 2) / chartWidth,
              (height - FIT_PADDING * 2) / chartHeight,
            ),
          );
          const x = (width - chartWidth * scale) / 2;
          const y = (height - chartHeight * scale) / 2;
          setTransform(zoomIdentity.translate(x, y).scale(scale), false);
        };
        const centerAt: ChartControls["centerAt"] = (point, options = {}) => {
          const { width, height } = outer.getBoundingClientRect();
          const scale = options.scale ?? zoomTransform(outer).k;
          setTransform(
            zoomIdentity
              .translate(width / 2 - point.x * scale, height / 2 - point.y * scale)
              .scale(scale),
            (options.animate ?? true) && animate,
          );
        };

        /**
         * The zoom is remembered per browser (localStorage), not on the
         * profile: it depends on the screen size. It's stored relative to
         * the centre card rather than as the raw transform, which would point
         * somewhere else entirely once more people are loaded and the layout
         * shifts.
         */
        function saveZoom(transform: { x: number; y: number; k: number }) {
          if (!latest.current.remember) return;
          const root = chartLayout.positions.get(latest.current.rootId);
          if (!root) return;
          const { width, height } = outer!.getBoundingClientRect();
          writeZoom(zoomKey(latest.current.rootId, chartKind, horizontal), {
            k: transform.k,
            dx: root.x * transform.k + transform.x - width / 2,
            dy: root.y * transform.k + transform.y - height / 2,
          });
        }

        // One listener on the inner svg rather than one per box: topola
        // recreates boxes on every render.
        const innerSelection = select<SVGSVGElement, unknown>(`#${svgId}`);
        innerSelection.on("dblclick", (event: MouseEvent) => {
          const box = (event.target as Element).closest("g.indi");
          const datum = box ? (select(box).datum() as { indi?: { id: string } }) : null;
          if (datum?.indi) latest.current.onCenter(datum.indi.id);
        });

        const highlight: ChartControls["highlight"] = (selected, loading) => {
          const root = latest.current.rootId;
          innerSelection
            .selectAll<SVGGElement, { indi: { id: string } }>("g.indi")
            .classed("is-root", (box) => box.indi.id === root)
            .classed("is-selected", (box) => box.indi.id === selected && box.indi.id !== root)
            .each(function (box) {
              select(this)
                .selectAll<SVGGElement, unknown>("g.card-expand")
                .classed("is-loading", function () {
                  return (
                    loading?.id === box.indi.id &&
                    this.getAttribute("data-direction") === loading.direction
                  );
                });
            });
        };

        const render = () => {
          const info = handle.render({ startIndi: latest.current.rootId });
          const [originX, originY] = info.origin;
          const positions = new Map<string, CardPosition>();
          for (const [id, position] of lastPositions) {
            positions.set(id, { x: position.x + originX, y: position.y + originY });
          }
          chartLayout = { positions, size: info.size };
          setLayout(chartLayout);
          highlight(latest.current.selectedId, latest.current.expanding);
          return chartLayout;
        };

        handleRef.current = handle;
        controlsRef.current = {
          render,
          zoomBy: (factor) => {
            if (animate) {
              outerSelection.transition().duration(200).call(zoomBehavior.scaleBy, factor);
            } else {
              outerSelection.call(zoomBehavior.scaleBy, factor);
            }
          },
          fit,
          centerAt,
          highlight,
        };

        render();
        drawnRoot.current = latest.current.rootId;
        const rootPosition = chartLayout.positions.get(latest.current.rootId);
        const remembered = latest.current.remember
          ? readZoom(zoomKey(latest.current.rootId, chartKind, horizontal))
          : null;
        if (remembered && rootPosition) {
          // Put the centre card back where it was on screen, at the same zoom.
          const { width, height } = outer.getBoundingClientRect();
          setTransform(
            zoomIdentity
              .translate(
                width / 2 + remembered.dx - rootPosition.x * remembered.k,
                height / 2 + remembered.dy - rootPosition.y * remembered.k,
              )
              .scale(remembered.k),
            false,
          );
        } else if (settings.initialZoom === "person" && rootPosition) {
          centerAt(rootPosition, { scale: 1, animate: false });
        } else {
          fit();
        }

        const resizeObserver = new ResizeObserver(([entry]) => {
          if (entry) setCanvasSize([entry.contentRect.width, entry.contentRect.height]);
        });
        resizeObserver.observe(outer);

        cleanup = () => {
          cancelAnimationFrame(viewFrame);
          resizeObserver.disconnect();
          outerSelection.interrupt();
          outerSelection.on(".zoom", null);
          innerSelection.on("dblclick", null);
          innerSelection.selectAll("*").remove();
          handleRef.current = null;
          controlsRef.current = null;
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
    // or a new centre must not tear down the chart (see the effect below).
    // The initial-zoom setting only matters when the chart is built.
  }, [
    chartKind,
    horizontal,
    svgId,
    i18n.language,
    settings.animateTransitions,
    settings.initialZoom,
  ]);

  useEffect(() => {
    const controls = controlsRef.current;
    const handle = handleRef.current;
    if (!controls || !handle) return;
    drawInputs.current = { cards, settings };
    handle.setData(data);
    // The returned layout, not `layout` state, which won't update until the
    // next React render.
    const rendered = controls.render();
    if (drawnRoot.current !== rootId) {
      drawnRoot.current = rootId;
      const position = rendered.positions.get(rootId);
      if (position) controls.centerAt(position);
    }
  }, [data, cards, settings, rootId]);

  useEffect(() => {
    controlsRef.current?.highlight(selectedId, expanding);
  }, [selectedId, expanding]);

  // The tree page's handle on the chart (find in tree). Re-assigned each
  // render, so it always sees the current layout.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      focusPerson: (id) => {
        const position = layout.positions.get(id);
        if (!position || !controlsRef.current) return false;
        controlsRef.current.centerAt(position, { scale: Math.max(view.k, FOCUS_SCALE) });
        return true;
      },
      exportChart: (format) => {
        const container = containerRef.current;
        const chart = document.querySelector<SVGSVGElement>(`#${svgId}`);
        const defs = outerRef.current?.querySelector("defs");
        const [width, height] = layout.size;
        if (!container || !chart || !defs || width === 0) {
          return Promise.reject(new Error(t("tree.export.notReady")));
        }
        // The export shouldn't carry the on-screen selection outline. Styles
        // are read synchronously at the start of `exportTree`, so the class
        // is only off for that instant; `is-exporting` turns CSS transitions
        // off so the change is visible to the read at once.
        const selected = [...chart.querySelectorAll("g.indi.is-selected")];
        container.classList.add("is-exporting");
        for (const card of selected) card.classList.remove("is-selected");
        const file = exportTree(
          { chart, defs, width, height, background: getComputedStyle(container).backgroundColor },
          format,
        );
        for (const card of selected) card.classList.add("is-selected");
        container.classList.remove("is-exporting");
        return file;
      },
    };
  });

  /** Arrow keys: the nearest card in that direction, by position on screen. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      const next = nearestCard(layout.positions, selectedId, rootId, direction, horizontal);
      if (!next) return;
      onSelect(next);
      const card = cards.get(next);
      if (card) setAnnouncement([card.name, ...card.lines].join(", "));
      const position = layout.positions.get(next);
      if (position && isNearEdge(position, view, canvasSize)) controls.centerAt(position);
      return;
    }
    const key = event.key;
    if (key === "Enter") {
      event.preventDefault();
      onCenter(selectedId);
    } else if (key === "+" || key === "=") {
      controls.zoomBy(1.25);
    } else if (key === "-") {
      controls.zoomBy(0.8);
    } else if (key === "0") {
      controls.fit();
    } else if (key === "ContextMenu" || (key === "F10" && event.shiftKey)) {
      // The keyboard way to the card menu, at the selected card.
      event.preventDefault();
      const position = layout.positions.get(selectedId);
      if (position) {
        onContextMenu(selectedId, {
          x: position.x * view.k + view.x,
          y: (position.y + CARD_HEIGHT / 2) * view.k + view.y,
        });
      }
    } else if (key === "Home") {
      event.preventDefault();
      onSelect(rootId);
      const position = layout.positions.get(rootId);
      if (position) controls.centerAt(position);
    }
  };

  if (loadError) {
    return (
      <p className="p-4 text-sm text-destructive">
        {t("tree.loadErrorTree", { message: loadError.message })}
      </p>
    );
  }

  return (
    // `application` is the ARIA role for a widget that handles its own keys
    // (here, arrow-key movement between cards in two dimensions) — screen
    // readers then pass the arrows through instead of using them to browse;
    // the help text says what they do. jsx-a11y doesn't count `application`
    // as interactive, hence the two exceptions.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="topola-chart relative h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      ref={containerRef}
      role="application"
      aria-label={t("tree.chartLabel")}
      aria-describedby={helpId}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <svg
        ref={outerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        // Clicking the chart focuses it, so the arrow keys work straight away.
        onPointerDown={(event) => event.currentTarget.parentElement?.focus({ preventScroll: true })}
      >
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
      <p id={helpId} className="sr-only">
        {t("tree.keyboardHelp")}
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
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
      {settings.showMinimap && (
        <Minimap
          layout={layout}
          view={view}
          canvasSize={canvasSize}
          rootId={rootId}
          selectedId={selectedId}
          onJump={(point) => controlsRef.current?.centerAt(point, { animate: false })}
        />
      )}
    </div>
  );
}

function isNearEdge(
  position: CardPosition,
  view: ViewTransform,
  [width, height]: [number, number],
): boolean {
  const x = position.x * view.k + view.x;
  const y = position.y * view.k + view.y;
  const halfWidth = (CARD_WIDTH / 2) * view.k;
  const halfHeight = (CARD_HEIGHT / 2) * view.k;
  return (
    x - halfWidth < EDGE_MARGIN ||
    y - halfHeight < EDGE_MARGIN ||
    x + halfWidth > width - EDGE_MARGIN ||
    y + halfHeight > height - EDGE_MARGIN
  );
}

/**
 * An overview of the whole chart: a dot per card and a rectangle for what's
 * on screen. Click or drag to move there. Hidden while the whole chart
 * already fits on screen, since there's nothing to navigate to.
 */
function Minimap({
  layout,
  view,
  canvasSize,
  rootId,
  selectedId,
  onJump,
}: {
  layout: ChartLayout;
  view: ViewTransform;
  canvasSize: [number, number];
  rootId: string;
  selectedId: string;
  onJump: (point: CardPosition) => void;
}) {
  const [chartWidth, chartHeight] = layout.size;
  const [canvasWidth, canvasHeight] = canvasSize;
  if (chartWidth === 0 || chartHeight === 0 || canvasWidth === 0) return null;

  const visible = {
    x: -view.x / view.k,
    y: -view.y / view.k,
    width: canvasWidth / view.k,
    height: canvasHeight / view.k,
  };
  const fitsOnScreen =
    visible.x <= 0 &&
    visible.y <= 0 &&
    visible.x + visible.width >= chartWidth &&
    visible.y + visible.height >= chartHeight;
  if (fitsOnScreen) return null;

  const scale = Math.min(MINIMAP_MAX_WIDTH / chartWidth, MINIMAP_MAX_HEIGHT / chartHeight);
  const width = chartWidth * scale;
  const height = chartHeight * scale;

  const jump = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onJump({ x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale });
  };

  return (
    <div className="absolute right-3 bottom-3 z-10 rounded-md border bg-card/90 p-1.5 shadow-sm backdrop-blur-sm">
      <svg
        width={width}
        height={height}
        // A mouse shortcut only — keyboard and screen-reader users move with
        // the arrow keys and "Find in tree", so it's hidden from them.
        aria-hidden="true"
        className="block cursor-pointer touch-none overflow-hidden rounded-sm"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          jump(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) jump(event);
        }}
      >
        {[...layout.positions].map(([id, position]) => (
          <rect
            key={id}
            x={(position.x - CARD_WIDTH / 2) * scale}
            y={(position.y - CARD_HEIGHT / 2) * scale}
            width={Math.max(CARD_WIDTH * scale, 2)}
            height={Math.max(CARD_HEIGHT * scale, 2)}
            rx={1}
            className={cn(
              "fill-muted-foreground/40",
              id === selectedId && "fill-foreground",
              id === rootId && "fill-primary",
            )}
          />
        ))}
        <rect
          x={visible.x * scale}
          y={visible.y * scale}
          width={visible.width * scale}
          height={visible.height * scale}
          className="fill-primary/10 stroke-primary"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

interface RememberedZoom {
  k: number;
  /** Where the centre card was, relative to the canvas centre, in screen pixels. */
  dx: number;
  dy: number;
}

function zoomKey(rootId: string, chartKind: ChartKind, horizontal: boolean): string {
  return `tree-zoom:${rootId}:${chartKind}:${horizontal ? "h" : "v"}`;
}

/** localStorage can be unavailable (private mode, blocked storage) — then nothing is remembered. */
function readZoom(key: string): RememberedZoom | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<RememberedZoom> | null;
    if (
      typeof value?.k === "number" &&
      typeof value.dx === "number" &&
      typeof value.dy === "number"
    ) {
      return { k: Math.min(MAX_SCALE, Math.max(MIN_SCALE, value.k)), dx: value.dx, dy: value.dy };
    }
  } catch {
    // Unreadable or unavailable: start from the default zoom instead.
  }
  return null;
}

function writeZoom(key: string, zoom: RememberedZoom) {
  try {
    localStorage.setItem(key, JSON.stringify(zoom));
  } catch {
    // Storage full or blocked: not remembering is fine.
  }
}
