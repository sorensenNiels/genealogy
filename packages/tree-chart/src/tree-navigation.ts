/** A card centre on the chart — see `CardPosition` in `card-renderer.ts`. */
export interface Point {
  x: number;
  y: number;
}

export const ARROW_DIRECTIONS: Record<string, "up" | "down" | "left" | "right" | undefined> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * The card to move to from `fromId` in `direction`: the nearest one on that
 * side, preferring the same generation for a sideways move and the nearest
 * generation for a move along the generations (up/down when top-down,
 * left/right when left-to-right). Spatial rather than by relationship, so
 * the arrows always go where the eye expects, in either layout.
 */
export function nearestCard(
  positions: ReadonlyMap<string, Point>,
  fromId: string,
  rootId: string,
  direction: "up" | "down" | "left" | "right",
  horizontal: boolean,
): string | null {
  const from = positions.get(fromId) ?? positions.get(rootId);
  if (!from) return null;
  const vertical = direction === "up" || direction === "down";
  const sign = direction === "up" || direction === "left" ? -1 : 1;
  // Moving along the generations, a nearer generation matters most;
  // moving within one, staying in it does.
  const alongGenerations = vertical !== horizontal;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, position] of positions) {
    if (id === fromId) continue;
    const primary = (vertical ? position.y - from.y : position.x - from.x) * sign;
    const cross = Math.abs(vertical ? position.x - from.x : position.y - from.y);
    if (primary <= 1) continue;
    const score = alongGenerations ? primary * 4 + cross : primary + cross * 4;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
