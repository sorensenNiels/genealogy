import type { TreeChartKind, TreeSettings } from "@genealogy/core";
import { select } from "d3-selection";
// Adds `.transition()` to d3 selections, for the smooth pans.
import "d3-transition";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import {
  AncestorChart,
  createChart,
  DescendantChart,
  RelativesChart,
  type JsonGedcomData,
} from "topola";

import {
  CARD_HEIGHT,
  CARD_RADIUS,
  CARD_WIDTH,
  createCardRendererClass,
  PHOTO_CLIP,
  PHOTO_CLIP_ID,
  TEXT_CLIP,
  TEXT_CLIP_ID,
  type CardPosition,
} from "./card-renderer";
import type { TreeCard } from "./topola-data";
import { ARROW_DIRECTIONS, nearestCard } from "./tree-navigation";

/** A point inside the chart's own box, in CSS pixels from its top-left corner. */
export interface ChartPoint {
  x: number;
  y: number;
}

/** What the chart draws — everything that can change without rebuilding it (see `TreeChart.update`). */
export interface TreeChartData {
  data: JsonGedcomData;
  /** What each person's card shows, by id. */
  cards: ReadonlyMap<string, TreeCard>;
  /** Display settings from the Settings page — see `treeSettingsSchema`. */
  settings: TreeSettings;
  rootId: string;
  /** Draw the "+" add-a-relative button on cards (editors in the app; never on the static site). */
  canAdd: boolean;
}

/** The chart's own text, in the host's language — the chart has no i18n of its own. */
export interface TreeChartLabels {
  /** The chart's accessible name. */
  chart: string;
  /** What the keys do, read by screen readers when the chart is focused. */
  keyboardHelp: string;
  /** The "+" button's accessible name, e.g. "Add a relative of Anders Jensen". */
  addRelative: (name: string) => string;
}

export interface TreeChartOptions extends TreeChartData {
  /** Fixed for the chart's life, like `horizontal` and `locale` — a change means a new chart. */
  chartKind: TreeChartKind;
  horizontal: boolean;
  /** Topola's own locale, for the little it formats itself. */
  locale: string;
  selectedId: string;
  labels: TreeChartLabels;
  /** A card was clicked or reached with the arrow keys. */
  onSelect: (id: string) => void;
  /** Double-click or Enter: make this person the centre of the tree. */
  onCenter: (id: string) => void;
  /** Open the card menu for a person, at this point in the chart (right-click, or the menu key on the selected card). */
  onContextMenu?: (id: string, point: ChartPoint) => void;
  /** A card's "+" was pressed: open the add menu for that person at this point. */
  onAddMenu?: (id: string, point: ChartPoint) => void;
}

/** The parts of a drawn chart an export needs — see `exportTree` in apps/frontend. */
export interface TreeChartExportSource {
  /** The `.topola-chart` element, whose classes and background the export reads. */
  element: HTMLElement;
  chart: SVGSVGElement;
  defs: SVGDefsElement;
  width: number;
  height: number;
}

export interface TreeChart {
  /**
   * New data, settings or centre person, on the same topola handle — so
   * topola animates cards to their new places. A new centre pans the view
   * to them at the same time ("smooth re-centring"); otherwise the selected
   * card (else the centre) stays where it was on screen.
   */
  update: (next: TreeChartData) => void;
  /** Marks this person's card as selected. */
  select: (id: string) => void;
  zoomBy: (factor: number) => void;
  /** The whole chart on screen. */
  fit: () => void;
  /** Pans (zooming in if far out) to a person's card and returns true; false when they aren't drawn in this chart. */
  focusPerson: (id: string) => boolean;
  exportSource: () => TreeChartExportSource | null;
  /** Removes the chart and its listeners. */
  destroy: () => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 2;
/** Room left around the chart when fitting it to the canvas. */
const FIT_PADDING = 40;
/** A found or keyboard-selected person is brought to at least this zoom, so their card is readable. */
const FOCUS_SCALE = 0.8;
/** A pan the user asked for (find, minimap, keyboard). */
const PAN_MS = 500;
/**
 * Topola's own card animation on a re-render: cards wait HIDE_TIME_MS, then
 * move for MOVE_TIME_MS (its transition-util). A view change caused by a
 * re-render uses the same timing, so the view and the cards move together.
 */
const CHART_MOVE_DELAY_MS = 200;
const CHART_MOVE_MS = 500;
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

/** How a view change moves: at once, as a pan of its own, or in step with topola's card animation. */
type ViewMotion = "instant" | "pan" | "withChart";

const EMPTY_LAYOUT: ChartLayout = { positions: new Map(), size: [0, 0] };

/** Each chart's svg needs a page-unique id: topola finds it by selector. */
let chartCount = 0;

/**
 * Topola's chart in `host`, with our cards, pan/zoom, a minimap and
 * keyboard navigation — the one chart behind both the app's tree page
 * (`TopolaChart`, a thin React wrapper) and the static family website.
 * Browser-only: topola and d3 need the DOM.
 *
 * The boxes are our own cards (`card-renderer.ts`), not topola's built-in
 * renderers; topola still does the family layout and the lines.
 *
 * Layout: an outer `<svg>` fills the canvas and carries d3-zoom (topola has
 * no pan/zoom of its own); inside it, a `<g>` takes the zoom transform and
 * holds the `<svg>` topola draws into. Topola sets that inner svg's size and
 * its own `<g>`'s translate, so the zoom can't live on either of those.
 *
 * Navigation built on the card positions the renderer reports: find
 * (`focusPerson`), the minimap, and arrow-key movement between cards — the
 * chart is focusable, and the selected person is announced.
 *
 * Zoom buttons are the host's: the app draws them with its own components.
 */
export function createTreeChart(host: HTMLElement, options: TreeChartOptions): TreeChart {
  const { chartKind, horizontal, labels } = options;
  const svgId = `topola-chart-${++chartCount}`;
  const helpId = `${svgId}-help`;
  let current: TreeChartData = {
    data: options.data,
    cards: options.cards,
    settings: options.settings,
    rootId: options.rootId,
    canAdd: options.canAdd,
  };
  let selectedId = options.selectedId;

  // `application` is the ARIA role for a widget that handles its own keys
  // (here, arrow-key movement between cards in two dimensions) — screen
  // readers then pass the arrows through instead of using them to browse;
  // the help text says what they do. No focus ring: clicking the chart
  // focuses it (for the arrow keys), and a frame round the whole canvas on
  // every click is just noise. The selected card's highlight shows where
  // keyboard focus is.
  const element = select(host)
    .append("div")
    .attr("class", "topola-chart")
    .attr("role", "application")
    .attr("aria-label", labels.chart)
    .attr("aria-describedby", helpId)
    .attr("tabindex", 0);
  const outerSelection = element.append("svg").attr("class", "tree-canvas");
  const outer = outerSelection.node()!;
  // Shared by every card — each card's own coordinates, so one each.
  const defs = outerSelection.append("defs");
  defs
    .append("clipPath")
    .attr("id", TEXT_CLIP_ID)
    .append("rect")
    .attr("x", TEXT_CLIP.x)
    .attr("y", TEXT_CLIP.y)
    .attr("width", TEXT_CLIP.width)
    .attr("height", TEXT_CLIP.height);
  defs
    .append("clipPath")
    .attr("id", PHOTO_CLIP_ID)
    .append("rect")
    .attr("x", PHOTO_CLIP.x)
    .attr("y", PHOTO_CLIP.y)
    .attr("width", PHOTO_CLIP.width)
    .attr("height", PHOTO_CLIP.height)
    .attr("rx", CARD_RADIUS);
  const zoomLayer = outerSelection.append("g").attr("class", "zoom-layer");
  const innerSelection = zoomLayer.append("svg").attr("id", svgId).attr("overflow", "visible");
  element.append("p").attr("id", helpId).attr("class", "tree-sr-only").text(labels.keyboardHelp);
  const live = element.append("p").attr("class", "tree-sr-only").attr("aria-live", "polite");
  const minimap = createMinimap(element.node()!, (point) => centerAt(point, { motion: "instant" }));

  // Clicking the chart focuses it, so the arrow keys work straight away.
  const focusChart = () => element.node()!.focus({ preventScroll: true });
  outer.addEventListener("pointerdown", focusChart);

  // The browser's reduced-motion request wins over the setting.
  const animate =
    current.settings.animateTransitions &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lastPositions = new Map<string, CardPosition>();
  const handle = createChart({
    json: current.data,
    chartType: {
      relatives: RelativesChart,
      ancestors: AncestorChart,
      descendants: DescendantChart,
    }[chartKind],
    renderer: createCardRendererClass({
      cardFor: (id) => current.cards.get(id),
      settings: () => current.settings,
      onContextMenu: (id, clientX, clientY) => {
        const box = outer.getBoundingClientRect();
        options.onContextMenu?.(id, { x: clientX - box.left, y: clientY - box.top });
      },
      canAdd: () => current.canAdd && options.onAddMenu !== undefined,
      onAddMenu: (id, clientX, clientY) => {
        const box = outer.getBoundingClientRect();
        options.onSelect(id);
        options.onAddMenu?.(id, { x: clientX - box.left, y: clientY - box.top });
      },
      addLabel: (id) => labels.addRelative(current.cards.get(id)?.name ?? ""),
      onPositions: (positions) => {
        lastPositions = positions;
      },
    }),
    svgSelector: `#${svgId}`,
    horizontal,
    animate,
    updateSvgSize: true,
    locale: options.locale,
    indiCallback: ({ id }) => options.onSelect(id),
  });

  let chartLayout = EMPTY_LAYOUT;
  let view: ViewTransform = { x: 0, y: 0, k: 1 };
  let canvasSize: [number, number] = [0, 0];
  /**
   * Where the view is meant to end up, as opposed to where it is
   * mid-animation (`zoomTransform`). A re-render that lands while a pan is
   * still running builds on this, so it doesn't freeze the view halfway and
   * leave the centre person off-centre.
   */
  let intended = zoomIdentity;

  // Throttled to a frame: the minimap redraws from this.
  let viewFrame = 0;
  const zoomBehavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([MIN_SCALE, MAX_SCALE])
    .on("zoom", (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
      zoomLayer.attr("transform", event.transform.toString());
      // A drag or wheel by the user sets where the view is meant to be.
      if (event.sourceEvent) intended = event.transform;
      const { x, y, k } = event.transform;
      view = { x, y, k };
      cancelAnimationFrame(viewFrame);
      viewFrame = requestAnimationFrame(() => minimap.drawView(view, canvasSize, current.settings));
    })
    // Remember where the view was left, relative to the centre card — see
    // `saveZoom`.
    .on("end", (event: { transform: ZoomTransform }) => saveZoom(event.transform));
  // Double-click centres the tree on a person (below), so it mustn't also
  // zoom.
  outerSelection.call(zoomBehavior).on("dblclick.zoom", null);

  const setTransform = (transform: ZoomTransform, motion: ViewMotion) => {
    intended = transform;
    if (motion === "instant" || !animate) {
      outerSelection.interrupt().call(zoomBehavior.transform, transform);
    } else if (motion === "withChart") {
      outerSelection
        .transition()
        .delay(CHART_MOVE_DELAY_MS)
        .duration(CHART_MOVE_MS)
        .call(zoomBehavior.transform, transform);
    } else {
      outerSelection.transition().duration(PAN_MS).call(zoomBehavior.transform, transform);
    }
  };
  const fit = () => {
    const { width, height } = outer.getBoundingClientRect();
    const [chartWidth, chartHeight] = chartLayout.size;
    if (chartWidth === 0 || chartHeight === 0 || width === 0 || height === 0) return;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(1, (width - FIT_PADDING * 2) / chartWidth, (height - FIT_PADDING * 2) / chartHeight),
    );
    const x = (width - chartWidth * scale) / 2;
    const y = (height - chartHeight * scale) / 2;
    setTransform(zoomIdentity.translate(x, y).scale(scale), "instant");
  };
  function centerAt(
    point: CardPosition,
    centerOptions: { scale?: number; motion?: ViewMotion } = {},
  ) {
    const { width, height } = outer.getBoundingClientRect();
    const scale = centerOptions.scale ?? intended.k;
    setTransform(
      zoomIdentity
        .translate(width / 2 - point.x * scale, height / 2 - point.y * scale)
        .scale(scale),
      centerOptions.motion ?? "pan",
    );
  }
  /** Shifts the view so a card that moved from `before` to `after` stays where it was on screen. */
  const keepInPlace = (before: CardPosition, after: CardPosition) => {
    const dx = (before.x - after.x) * intended.k;
    const dy = (before.y - after.y) * intended.k;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    setTransform(
      zoomIdentity.translate(intended.x + dx, intended.y + dy).scale(intended.k),
      "withChart",
    );
  };
  const zoomBy = (factor: number) => {
    // Around the canvas centre, from where the view is meant to be.
    const { width, height } = outer.getBoundingClientRect();
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, intended.k * factor));
    const ratio = scale / intended.k;
    setTransform(
      zoomIdentity
        .translate(
          width / 2 - (width / 2 - intended.x) * ratio,
          height / 2 - (height / 2 - intended.y) * ratio,
        )
        .scale(scale),
      "pan",
    );
  };

  /**
   * The zoom is remembered per browser (localStorage), not on the profile:
   * it depends on the screen size. It's stored relative to the centre card
   * rather than as the raw transform, which would point somewhere else
   * entirely once more people are loaded and the layout shifts.
   */
  function saveZoom(transform: ViewTransform) {
    if (!current.settings.rememberLastView) return;
    const root = chartLayout.positions.get(current.rootId);
    if (!root) return;
    const { width, height } = outer.getBoundingClientRect();
    writeZoom(zoomKey(current.rootId, chartKind, horizontal), {
      k: transform.k,
      dx: root.x * transform.k + transform.x - width / 2,
      dy: root.y * transform.k + transform.y - height / 2,
    });
  }

  // One listener on the inner svg rather than one per box: topola
  // recreates boxes on every render.
  innerSelection.on("dblclick", (event: MouseEvent) => {
    const box = (event.target as Element).closest("g.indi");
    const datum = box ? (select(box).datum() as { indi?: { id: string } }) : null;
    if (datum?.indi) options.onCenter(datum.indi.id);
  });

  /** Marks the root and the selected card — after every render, and when the selection changes. */
  const highlight = () => {
    const root = current.rootId;
    innerSelection
      .selectAll<SVGGElement, { indi: { id: string } }>("g.indi")
      .classed("is-root", (box) => box.indi.id === root)
      .classed("is-selected", (box) => box.indi.id === selectedId && box.indi.id !== root);
    minimap.drawCards(chartLayout, root, selectedId);
  };

  /** Re-renders with the current data and root; returns the new layout. */
  const render = (): ChartLayout => {
    const info = handle.render({ startIndi: current.rootId });
    const [originX, originY] = info.origin;
    const positions = new Map<string, CardPosition>();
    for (const [id, position] of lastPositions) {
      positions.set(id, { x: position.x + originX, y: position.y + originY });
    }
    chartLayout = { positions, size: info.size };
    highlight();
    minimap.drawView(view, canvasSize, current.settings);
    return chartLayout;
  };

  render();
  let drawnRoot = current.rootId;
  const rootPosition = chartLayout.positions.get(current.rootId);
  const remembered = current.settings.rememberLastView
    ? readZoom(zoomKey(current.rootId, chartKind, horizontal))
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
      "instant",
    );
  } else if (current.settings.initialZoom === "person" && rootPosition) {
    centerAt(rootPosition, { scale: 1, motion: "instant" });
  } else {
    fit();
  }

  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    canvasSize = [entry.contentRect.width, entry.contentRect.height];
    minimap.drawView(view, canvasSize, current.settings);
  });
  resizeObserver.observe(outer);

  /** Arrow keys: the nearest card in that direction, by position on screen. */
  const onKeyDown = (event: KeyboardEvent) => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      const next = nearestCard(
        chartLayout.positions,
        selectedId,
        current.rootId,
        direction,
        horizontal,
      );
      if (!next) return;
      selectCard(next);
      options.onSelect(next);
      const card = current.cards.get(next);
      if (card) live.text([card.name, ...card.lines].join(", "));
      const position = chartLayout.positions.get(next);
      if (position && isNearEdge(position, view, canvasSize)) centerAt(position);
      return;
    }
    const key = event.key;
    if (key === "Enter") {
      event.preventDefault();
      options.onCenter(selectedId);
    } else if (key === "+" || key === "=") {
      zoomBy(1.25);
    } else if (key === "-") {
      zoomBy(0.8);
    } else if (key === "0") {
      fit();
    } else if (key === "ContextMenu" || (key === "F10" && event.shiftKey)) {
      // The keyboard way to the card menu, at the selected card.
      if (!options.onContextMenu) return;
      event.preventDefault();
      const position = chartLayout.positions.get(selectedId);
      if (position) {
        options.onContextMenu(selectedId, {
          x: position.x * view.k + view.x,
          y: (position.y + CARD_HEIGHT / 2) * view.k + view.y,
        });
      }
    } else if (key === "Home") {
      event.preventDefault();
      selectCard(current.rootId);
      options.onSelect(current.rootId);
      const position = chartLayout.positions.get(current.rootId);
      if (position) centerAt(position);
    }
  };
  element.on("keydown", onKeyDown);

  function selectCard(id: string) {
    if (id === selectedId) return;
    selectedId = id;
    highlight();
  }

  return {
    update: (next) => {
      current = next;
      handle.setData(next.data);
      const before = chartLayout;
      const rendered = render();
      if (drawnRoot !== next.rootId) {
        // A new centre person: the view moves to them as their card moves.
        drawnRoot = next.rootId;
        const position = rendered.positions.get(next.rootId);
        if (position) centerAt(position, { motion: "withChart" });
        return;
      }
      // Same centre, new layout (their relatives just arrived, "load more",
      // an add or a removal): a re-render can shift every card, so keep the
      // one the user is looking at — the selected card, else the centre
      // person — where it is on screen.
      const anchor = [selectedId, next.rootId].find(
        (id) => before.positions.has(id) && rendered.positions.has(id),
      );
      if (anchor) keepInPlace(before.positions.get(anchor)!, rendered.positions.get(anchor)!);
    },
    select: selectCard,
    zoomBy,
    fit,
    focusPerson: (id) => {
      const position = chartLayout.positions.get(id);
      if (!position) return false;
      centerAt(position, { scale: Math.max(view.k, FOCUS_SCALE) });
      return true;
    },
    exportSource: () => {
      const chart = innerSelection.node();
      const [width, height] = chartLayout.size;
      if (!chart || width === 0) return null;
      return { element: element.node()!, chart, defs: defs.node()!, width, height };
    },
    destroy: () => {
      cancelAnimationFrame(viewFrame);
      resizeObserver.disconnect();
      outer.removeEventListener("pointerdown", focusChart);
      outerSelection.interrupt();
      outerSelection.on(".zoom", null);
      innerSelection.on("dblclick", null);
      element.on("keydown", null);
      element.remove();
    },
  };
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
 * already fits on screen, since there's nothing to navigate to. A mouse
 * shortcut only — keyboard and screen-reader users move with the arrow keys
 * and "find", so it's hidden from them.
 */
function createMinimap(container: HTMLElement, onJump: (point: CardPosition) => void) {
  const root = select(container).append("div").attr("class", "tree-minimap").attr("hidden", "");
  const svg = root.append("svg").attr("aria-hidden", "true");
  const cards = svg.append("g");
  const visibleRect = svg.append("rect").attr("class", "minimap-view");
  let scale = 1;
  let size: [number, number] = [0, 0];

  const jump = (event: PointerEvent) => {
    const rect = svg.node()!.getBoundingClientRect();
    onJump({ x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale });
  };
  svg
    .on("pointerdown", (event: PointerEvent) => {
      svg.node()!.setPointerCapture(event.pointerId);
      jump(event);
    })
    .on("pointermove", (event: PointerEvent) => {
      if (svg.node()!.hasPointerCapture(event.pointerId)) jump(event);
    });

  return {
    /** After every render and selection change: one rect per card. */
    drawCards(layout: ChartLayout, rootId: string, selectedId: string) {
      size = layout.size;
      const [chartWidth, chartHeight] = size;
      if (chartWidth === 0 || chartHeight === 0) return;
      scale = Math.min(MINIMAP_MAX_WIDTH / chartWidth, MINIMAP_MAX_HEIGHT / chartHeight);
      svg.attr("width", chartWidth * scale).attr("height", chartHeight * scale);
      cards
        .selectAll<SVGRectElement, [string, CardPosition]>("rect")
        .data([...layout.positions], ([id]) => id)
        .join("rect")
        .attr("x", ([, position]) => (position.x - CARD_WIDTH / 2) * scale)
        .attr("y", ([, position]) => (position.y - CARD_HEIGHT / 2) * scale)
        .attr("width", Math.max(CARD_WIDTH * scale, 2))
        .attr("height", Math.max(CARD_HEIGHT * scale, 2))
        .attr("rx", 1)
        .attr("class", "minimap-card")
        .classed("is-selected", ([id]) => id === selectedId)
        .classed("is-root", ([id]) => id === rootId);
    },
    /** On every view change: the on-screen rectangle, and whether to show at all. */
    drawView(
      view: ViewTransform,
      [canvasWidth, canvasHeight]: [number, number],
      settings: TreeSettings,
    ) {
      const [chartWidth, chartHeight] = size;
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
      const hidden =
        !settings.showMinimap ||
        chartWidth === 0 ||
        chartHeight === 0 ||
        canvasWidth === 0 ||
        fitsOnScreen;
      root.attr("hidden", hidden ? "" : null);
      if (hidden) return;
      visibleRect
        .attr("x", visible.x * scale)
        .attr("y", visible.y * scale)
        .attr("width", visible.width * scale)
        .attr("height", visible.height * scale);
    },
  };
}

interface RememberedZoom {
  k: number;
  /** Where the centre card was, relative to the canvas centre, in screen pixels. */
  dx: number;
  dy: number;
}

function zoomKey(rootId: string, chartKind: TreeChartKind, horizontal: boolean): string {
  return `tree-zoom:${rootId}:${chartKind}:${horizontal ? "h" : "v"}`;
}

/** localStorage can be unavailable (private mode, blocked storage, some `file://` pages) — then nothing is remembered. */
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

function writeZoom(key: string, remembered: RememberedZoom) {
  try {
    localStorage.setItem(key, JSON.stringify(remembered));
  } catch {
    // Storage full or blocked: not remembering is fine.
  }
}
