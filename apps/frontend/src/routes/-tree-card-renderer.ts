import type { TreeSettings } from "@genealogy/core";
import type { select, Selection } from "d3-selection";
import type * as Topola from "topola";
import type {
  FamDetails,
  IndiDetails,
  Renderer,
  RendererOptions,
  TreeEntry,
  TreeNode,
  TreeNodeSelection,
} from "topola";

import type { TreeCard } from "../lib/topola-data";

/** What a card shows for one person — built by the tree page from our own rows (`treeCard`), not from topola's GEDCOM fields. */
export type CardInfo = TreeCard;

/** The card itself. Fixed, so topola never has to measure text (see `TopolaChart`). */
export const CARD_WIDTH = 248;
export const CARD_HEIGHT = 72;
/**
 * Each card reports a box this much bigger on every side than it draws.
 * Topola's own gaps between boxes are fixed (15px across, 34px between
 * generations) and not configurable, and with them cards sat almost on top
 * of each other; the padding is how we get room to breathe. Lines still
 * meet the cards: they run to the box centres, under the opaque cards.
 */
const PAD_X = 14;
const PAD_Y = 10;
const PHOTO_SIZE = 52;
const INSET = 10;
/** Photo on the left, text after it. */
const TEXT_X = INSET + PHOTO_SIZE + 12;
const TEXT_WIDTH = CARD_WIDTH - TEXT_X - INSET;
/** The gender badge over the photo's bottom-right corner. */
const BADGE_RADIUS = 9;
/** The "+" (add a relative) at the bottom of a card. */
const ADD_RADIUS = 11;
/** Shared by every card — clip paths are in each card's own coordinates, so one definition serves all. */
export const TEXT_CLIP_ID = "tree-card-text-clip";
export const PHOTO_CLIP_ID = "tree-card-photo-clip";
export const CARD_RADIUS = 10;
export const PHOTO_X = INSET;
export const PHOTO_Y = (CARD_HEIGHT - PHOTO_SIZE) / 2;
export const TEXT_CLIP = { x: TEXT_X, y: 0, width: TEXT_WIDTH, height: CARD_HEIGHT };
export const PHOTO_CLIP = { x: PHOTO_X, y: PHOTO_Y, width: PHOTO_SIZE, height: PHOTO_SIZE };

/** Rough ellipsis before the clip path takes over, so a long name ends in "…" rather than mid-letter. */
function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
}

const GENDER_CLASS = { M: "male", F: "female", U: "unknown" } as const;

/** A card's centre, in the coordinates of topola's own `<g>` (add the render's `origin` for the inner svg). */
export interface CardPosition {
  x: number;
  y: number;
}

/** What the renderer reads and reports, through `TopolaChart`'s refs so it's always current. */
export interface CardRendererHooks {
  cardFor: (id: string) => CardInfo | undefined;
  /** Read at draw time, so a settings change shows on the next render. */
  settings: () => TreeSettings;
  /** A card was right-clicked, at this point on the page (`clientX`/`clientY`). */
  onContextMenu: (id: string, clientX: number, clientY: number) => void;
  /** Whether to draw the "+" at all — editors only, since it changes the tree. */
  canAdd: () => boolean;
  /** A card's "+" was pressed; the point is the button's bottom centre on the page, where its menu opens. */
  onAddMenu: (id: string, clientX: number, clientY: number) => void;
  /** The "+" button's accessible name, e.g. "Add a relative of Anders Jensen". */
  addLabel: (id: string) => string;
  /**
   * Every drawn person's card centre, reported at the end of each render.
   * Computed from the layout, not read off the DOM, so it's the final
   * position even while topola is still animating cards into place — and
   * it leaves out cards topola is fading out. A person drawn twice
   * (pedigree collapse) keeps the first.
   */
  onPositions: (positions: Map<string, CardPosition>) => void;
}

interface CardDatum {
  indi: TreeEntry;
  generation: number | undefined;
  x: number;
  y: number;
}

type TopolaModule = typeof Topola;
type SelectFn = typeof select;

/**
 * Builds topola's renderer class for our cards. A factory because topola is
 * only loaded in the browser (a dynamic import in `TopolaChart`), so its
 * `CompositeRenderer` base class isn't available at module load. The base
 * class does the sizing bookkeeping and the anchor points lines attach to;
 * this only says how big a card is and how to draw it.
 */
export function createCardRendererClass(
  topola: TopolaModule,
  select: SelectFn,
  hooks: CardRendererHooks,
) {
  const { cardFor, settings } = hooks;
  return class CardRenderer extends topola.CompositeRenderer implements Renderer {
    constructor(readonly rendererOptions: RendererOptions<IndiDetails, FamDetails>) {
      super(rendererOptions);
    }

    getPreferredIndiSize(): [number, number] {
      return [CARD_WIDTH + PAD_X * 2, CARD_HEIGHT + PAD_Y * 2];
    }

    // Styling lives in styles.css under `.topola-chart`, with the theme tokens.
    getCss(): string {
      return "";
    }

    render(enter: TreeNodeSelection, update: TreeNodeSelection): void {
      const horizontal = Boolean(this.rendererOptions.horizontal);
      const nodes = enter.merge(update);
      // Redrawn from scratch each render: cheap at tree sizes, and a card's
      // content (a name just edited, a photo just set) is always current.
      nodes.selectAll("g.cards").remove();
      const cards = nodes.append("g").attr("class", "cards");

      // A short marriage line in the gap between partners; the line down to
      // their children starts from its middle.
      cards
        .filter((node) => Boolean(node.data.indi && node.data.spouse))
        .append("line")
        .attr("class", "marriage")
        .attr("x1", (node) =>
          horizontal ? PAD_X + CARD_WIDTH / 2 : node.data.indi!.width! - PAD_X,
        )
        .attr("x2", (node) =>
          horizontal ? PAD_X + CARD_WIDTH / 2 : node.data.indi!.width! + PAD_X,
        )
        .attr("y1", (node) =>
          horizontal ? node.data.indi!.height! - PAD_Y : PAD_Y + CARD_HEIGHT / 2,
        )
        .attr("y2", (node) =>
          horizontal ? node.data.indi!.height! + PAD_Y : PAD_Y + CARD_HEIGHT / 2,
        );

      const current = settings();
      const card = cards
        .selectAll<SVGGElement, CardDatum>("g.indi")
        .data((node) => cardData(node.data, horizontal))
        .enter()
        .append("g")
        .attr("class", (datum) => {
          const info = cardFor(datum.indi.id);
          const directLine = current.highlightDirectLine && info?.isDirectLine;
          return `indi ${GENDER_CLASS[info?.gender ?? "U"]}${directLine ? " direct-line" : ""}`;
        })
        .attr("transform", (datum) => `translate(${datum.x + PAD_X}, ${datum.y + PAD_Y})`)
        .on("click", (_event, datum) =>
          this.rendererOptions.indiCallback?.({
            id: datum.indi.id,
            generation: datum.generation ?? 0,
          }),
        )
        // Right-click selects the card too, then opens its menu instead of
        // the browser's.
        .on("contextmenu", (event: MouseEvent, datum) => {
          event.preventDefault();
          this.rendererOptions.indiCallback?.({
            id: datum.indi.id,
            generation: datum.generation ?? 0,
          });
          hooks.onContextMenu(datum.indi.id, event.clientX, event.clientY);
        });

      card.each(function (datum) {
        drawCard(select(this), cardFor(datum.indi.id), current);
      });
      if (hooks.canAdd()) {
        card.each(function (datum) {
          drawAddButton(select(this), datum.indi.id, hooks);
        });
      }

      const positions = new Map<string, CardPosition>();
      nodes.each((node) => {
        const left = node.x - node.data.width! / 2;
        const top = node.y - node.data.height! / 2;
        for (const datum of cardData(node.data, horizontal)) {
          if (positions.has(datum.indi.id)) continue;
          positions.set(datum.indi.id, {
            x: left + datum.x + PAD_X + CARD_WIDTH / 2,
            y: top + datum.y + PAD_Y + CARD_HEIGHT / 2,
          });
        }
      });
      hooks.onPositions(positions);
    }
  };
}

/** The (one or two) people in a topola node, with their offsets inside it. */
function cardData(node: TreeNode, horizontal: boolean): CardDatum[] {
  const result: CardDatum[] = [];
  if (node.indi) result.push({ indi: node.indi, generation: node.generation, x: 0, y: 0 });
  if (node.spouse) {
    const offset = node.indi ? (horizontal ? node.indi.height! : node.indi.width!) : 0;
    result.push({
      indi: node.spouse,
      generation: node.generation,
      x: horizontal ? 0 : offset,
      y: horizontal ? offset : 0,
    });
  }
  return result;
}

function drawCard(
  card: Selection<SVGGElement, CardDatum, null, undefined>,
  info: CardInfo | undefined,
  settings: TreeSettings,
) {
  card
    .append("rect")
    .attr("class", "card-bg")
    .attr("width", CARD_WIDTH)
    .attr("height", CARD_HEIGHT)
    .attr("rx", CARD_RADIUS);
  const text = card.append("g").attr("clip-path", `url(#${TEXT_CLIP_ID})`);
  const name = info?.name ?? "";
  const lines = info?.lines ?? [];
  // Vertically centre the block: one name line plus up to two detail lines.
  const top = lines.length === 0 ? 41 : lines.length === 1 ? 32 : 25;
  text
    .append("text")
    .attr("class", "card-name")
    .attr("x", TEXT_X)
    .attr("y", top)
    .text(truncate(name, 22));
  lines.forEach((line, index) => {
    text
      .append("text")
      .attr("class", "card-meta")
      .attr("x", TEXT_X)
      .attr("y", top + 18 + index * 16)
      .text(truncate(line, 26));
  });

  // With photos turned off in Settings, everyone gets the initials square.
  if (info?.photoUrl && settings.showPhotos) {
    card
      .append("image")
      .attr("x", PHOTO_X)
      .attr("y", PHOTO_Y)
      .attr("width", PHOTO_SIZE)
      .attr("height", PHOTO_SIZE)
      .attr("preserveAspectRatio", "xMidYMid slice")
      .attr("clip-path", `url(#${PHOTO_CLIP_ID})`)
      .attr("href", info.photoUrl);
  } else {
    card
      .append("rect")
      .attr("class", "card-initials-bg")
      .attr("x", PHOTO_X)
      .attr("y", PHOTO_Y)
      .attr("width", PHOTO_SIZE)
      .attr("height", PHOTO_SIZE)
      .attr("rx", CARD_RADIUS);
    card
      .append("text")
      .attr("class", "card-initials")
      .attr("x", PHOTO_X + PHOTO_SIZE / 2)
      .attr("y", PHOTO_Y + PHOTO_SIZE / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .text(info?.initials ?? "");
  }
  if (settings.showMourningBand && info?.isDeceased) drawMourningBand(card);
  if (settings.showGenderBadge && info && info.gender !== "U") {
    drawGenderBadge(card, info.gender);
  }
  card
    .append("rect")
    .attr("class", "card-border")
    .attr("width", CARD_WIDTH)
    .attr("height", CARD_HEIGHT)
    .attr("rx", CARD_RADIUS);
}

/**
 * A black band across the photo's top-left corner — the mourning ribbon on
 * an old memorial photograph — for someone who has died. Clipped to the
 * photo's rounded square, so it runs edge to edge across the corner.
 */
function drawMourningBand(card: Selection<SVGGElement, CardDatum, null, undefined>) {
  const reach = 22;
  card
    .append("line")
    .attr("class", "card-mourning")
    .attr("x1", PHOTO_X - 4)
    .attr("y1", PHOTO_Y + reach)
    .attr("x2", PHOTO_X + reach)
    .attr("y2", PHOTO_Y - 4)
    .attr("clip-path", `url(#${PHOTO_CLIP_ID})`);
}

/**
 * Lucide's `mars`/`venus` icons (24×24, stroked), so the badge matches the
 * icons used everywhere else in the app. D3 draws the cards, so the icon
 * paths are copied here rather than rendered by lucide-react.
 */
const GENDER_ICON_PATHS = {
  M: ["M16 3h5v5", "m21 3-6.75 6.75", "M4 14a6 6 0 1 0 12 0a6 6 0 1 0-12 0"],
  F: ["M12 15v7", "M9 19h6", "M6 9a6 6 0 1 0 12 0a6 6 0 1 0-12 0"],
} as const;

/** A small gender-coloured disc over the photo's bottom-right corner, ringed in the card colour so it reads as cut out of the photo. */
function drawGenderBadge(
  card: Selection<SVGGElement, CardDatum, null, undefined>,
  gender: "M" | "F",
) {
  const cx = PHOTO_X + PHOTO_SIZE - 3;
  const cy = PHOTO_Y + PHOTO_SIZE - 3;
  const badge = card.append("g").attr("class", "card-gender");
  badge.append("circle").attr("cx", cx).attr("cy", cy).attr("r", BADGE_RADIUS);
  // 24-unit icon scaled to 11px, centred on the disc.
  const scale = 11 / 24;
  const icon = badge
    .append("g")
    .attr("class", "card-gender-icon")
    .attr("transform", `translate(${cx - 5.5}, ${cy - 5.5}) scale(${scale})`);
  for (const d of GENDER_ICON_PATHS[gender]) icon.append("path").attr("d", d);
}

/**
 * The "+" at the bottom centre of a card: opens a menu to add a parent,
 * sibling or child (see `AddRelativeMenu` on the tree page). Shown only on
 * the selected card and the one under the pointer (styles.css), so a chart
 * full of cards isn't a chart full of buttons; on a touch screen, tapping a
 * card selects it, which shows its "+".
 */
function drawAddButton(
  card: Selection<SVGGElement, CardDatum, null, undefined>,
  id: string,
  hooks: CardRendererHooks,
) {
  const label = hooks.addLabel(id);
  const button = card
    .append("g")
    .attr("class", "card-add")
    .attr("transform", `translate(${CARD_WIDTH / 2}, ${CARD_HEIGHT})`)
    .attr("role", "button")
    .attr("aria-label", label)
    .on("click", (event: MouseEvent) => {
      // The card's own click selects it; this opens the add menu instead.
      event.stopPropagation();
      const box = (event.currentTarget as SVGGElement).getBoundingClientRect();
      hooks.onAddMenu(id, box.left + box.width / 2, box.bottom);
    })
    // A double-click on the card re-centres the tree; not from here.
    .on("dblclick", (event: MouseEvent) => event.stopPropagation());
  button.append("title").text(label);
  button.append("circle").attr("r", ADD_RADIUS);
  button.append("path").attr("d", "M-4.5 0 H4.5 M0 -4.5 V4.5");
}
