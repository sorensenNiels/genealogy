import ELK from "elkjs/lib/elk.bundled.js";

// Matches the fixed size PersonNode renders at — elk needs a concrete size per
// node to lay anything out, and the node isn't user-resizable in this first
// version.
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 84;

const ROW_GAP = 96;
const ROW_HEIGHT = NODE_HEIGHT + ROW_GAP;
const SIBLING_GAP = 48;
const SPOUSE_GAP = 24;

export interface LayoutEdge {
  parentId: string;
  childId: string;
}

/**
 * Assigns every person a generation number relative to `rootId` (0), by
 * flood-filling outward: +1 down a `PARENT_OF` edge, -1 up one, +0 across a
 * spouse edge (a couple shares a row even when only one side is a blood
 * relative of the root). This is the row a person lands on; `layoutTree`
 * below only decides where within that row.
 */
export function computeGenerations(
  rootId: string,
  parentEdges: LayoutEdge[],
  spouseEdges: Array<[string, string]>,
): Map<string, number> {
  const generation = new Map<string, number>([[rootId, 0]]);
  const neighbors = new Map<string, Array<{ id: string; offset: number }>>();
  const link = (a: string, b: string, offset: number) => {
    const existing = neighbors.get(a) ?? [];
    existing.push({ id: b, offset });
    neighbors.set(a, existing);
  };
  for (const edge of parentEdges) {
    link(edge.parentId, edge.childId, 1);
    link(edge.childId, edge.parentId, -1);
  }
  for (const [a, b] of spouseEdges) {
    link(a, b, 0);
    link(b, a, 0);
  }

  const queue = [rootId];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    const currentGeneration = generation.get(current)!;
    for (const { id, offset } of neighbors.get(current) ?? []) {
      if (!generation.has(id)) {
        generation.set(id, currentGeneration + offset);
        queue.push(id);
      }
    }
  }
  return generation;
}

/**
 * Positions every person. `generation` (see `computeGenerations`) is the
 * authoritative row — it becomes `y` directly, rather than anything elk
 * computes — because elk's own layered algorithm can only place a node
 * relative to its *edges*, and a strictly layered (Sugiyama-style) algorithm
 * always treats an edge as "target is at least one layer below source". Fed a
 * spouse edge, it would either ignore the same-row intent or shift one node
 * down a layer to make the edge routable; neither is what a couple sharing a
 * row needs.
 *
 * **Couples are laid out as one block.** Partners on the same row (a whole
 * chain of them, for someone remarried) become a single elk node as wide as
 * all their cards, and every `PARENT_OF` edge is fed to elk between blocks.
 * So elk can't pull a couple apart — before blocks, each partner was centred
 * under their own parents and a couple could end up far apart, joined by a
 * long marriage line. Inside a block, partners are then ordered by where
 * their own parents ended up, so each sits on the side nearer their family
 * and the lines up to both families don't cross under the couple.
 *
 * elk is told to use our rows as its own layers (`INTERACTIVE` layering,
 * which reads each node's starting `y`), not to work out layers from the
 * edges: left to itself it layers by longest path, which disagrees with
 * `generation` as soon as an in-law's own parents are loaded (they have no
 * parents themselves, so elk puts them a layer too high), and elk only keeps
 * nodes apart within a layer — cards from different elk layers overlapped on
 * the same row. For the same reason elk lays everything out as one graph
 * (`separateConnectedComponents: false`): by default it lays each
 * disconnected piece out on its own and packs the pieces side by side by its
 * *own* layers.
 */
export async function layoutTree(
  personIds: string[],
  parentEdges: LayoutEdge[],
  spouseEdges: Array<[string, string]>,
  generations: Map<string, number>,
  rootId: string,
): Promise<Map<string, { x: number; y: number }>> {
  const minGeneration = Math.min(0, ...generations.values());
  const rowY = (id: string) => ((generations.get(id) ?? 0) - minGeneration) * ROW_HEIGHT;
  const known = new Set(personIds);
  if (!known.has(rootId)) known.add(rootId);

  // Couple blocks: union-find over spouse edges whose partners share a row.
  const parentOf = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parentOf.has(root) && parentOf.get(root) !== root) root = parentOf.get(root)!;
    return root;
  };
  for (const [a, b] of spouseEdges) {
    if (!known.has(a) || !known.has(b) || rowY(a) !== rowY(b)) continue;
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parentOf.set(rootB, rootA);
  }
  const members = new Map<string, string[]>();
  for (const id of known) {
    const block = find(id);
    members.set(block, [...(members.get(block) ?? []), id]);
  }
  const blockOf = (id: string) => find(id);
  const blockWidth = (block: string) =>
    members.get(block)!.length * (NODE_WIDTH + SPOUSE_GAP) - SPOUSE_GAP;

  const blockEdges = new Map<string, { source: string; target: string }>();
  for (const edge of parentEdges) {
    if (!known.has(edge.parentId) || !known.has(edge.childId)) continue;
    const source = blockOf(edge.parentId);
    const target = blockOf(edge.childId);
    if (source === target) continue;
    blockEdges.set(`${source}->${target}`, { source, target });
  }

  const elk = new ELK();
  const layout = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": String(SIBLING_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(ROW_GAP),
      "elk.layered.layering.strategy": "INTERACTIVE",
      "elk.separateConnectedComponents": "false",
    },
    children: [...members.keys()].map((block) => ({
      id: block,
      y: rowY(block),
      width: blockWidth(block),
      height: NODE_HEIGHT,
    })),
    edges: [...blockEdges.values()].map((edge, index) => ({
      id: `block-${index}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });
  const blockX = new Map((layout.children ?? []).map((child) => [child.id, child.x ?? 0]));

  // Each partner on the side nearer their own parents; a partner with no
  // parents on the canvas (an in-law whose family isn't loaded) stays put in
  // the middle of the ordering. Stable for ties, so the layout doesn't jump.
  const parentsX = new Map<string, number[]>();
  for (const edge of parentEdges) {
    const x = blockX.get(blockOf(edge.parentId));
    if (x === undefined) continue;
    const centre = x + blockWidth(blockOf(edge.parentId)) / 2;
    parentsX.set(edge.childId, [...(parentsX.get(edge.childId) ?? []), centre]);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [block, ids] of members) {
    const x0 = blockX.get(block) ?? 0;
    const centre = x0 + blockWidth(block) / 2;
    const keyOf = (id: string) => {
      const xs = parentsX.get(id);
      return xs ? xs.reduce((sum, x) => sum + x, 0) / xs.length : centre;
    };
    const ordered = ids.toSorted((a, b) => keyOf(a) - keyOf(b));
    ordered.forEach((id, index) => {
      positions.set(id, { x: x0 + index * (NODE_WIDTH + SPOUSE_GAP), y: rowY(id) });
    });
  }

  return separateRows(positions);
}

/**
 * Last-resort guarantee that no two cards on a row overlap: sweeps each row
 * left to right and pushes a card right if it would sit on top of the one
 * before it. The layout above shouldn't need it, but a tangled tree (someone
 * recorded as their own ancestor, a cousin marriage pulling one row two ways)
 * can still produce a collision, and a card slightly off-center is far better
 * than one hidden behind another.
 */
function separateRows(
  positions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const rows = new Map<number, string[]>();
  for (const [id, position] of positions) {
    rows.set(position.y, [...(rows.get(position.y) ?? []), id]);
  }
  for (const ids of rows.values()) {
    ids.sort((a, b) => positions.get(a)!.x - positions.get(b)!.x);
    for (let index = 1; index < ids.length; index++) {
      const previous = positions.get(ids[index - 1]!)!;
      const current = positions.get(ids[index]!)!;
      const minX = previous.x + NODE_WIDTH + SPOUSE_GAP;
      if (current.x < minX) positions.set(ids[index]!, { ...current, x: minX });
    }
  }
  return positions;
}
