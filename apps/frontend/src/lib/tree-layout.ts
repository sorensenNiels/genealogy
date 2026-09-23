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
 * row needs. So elk here only ever sees `PARENT_OF` edges, and only decides
 * left-to-right ordering (crossing minimization) within each already-fixed row.
 *
 * A person with no `PARENT_OF` edge at all — a spouse who isn't a blood
 * relative of anyone else collected for this tree — never reaches elk, and is
 * instead placed beside whichever partner *did* get a position, on the same
 * row. That resolves in a handful of passes at most (a short in-law chain),
 * seeded by the root itself always getting a position even if the root has no
 * `PARENT_OF` edge either (a person whose only recorded relationship is a
 * spouse).
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

  const blooded = new Set<string>();
  for (const edge of parentEdges) {
    blooded.add(edge.parentId);
    blooded.add(edge.childId);
  }
  const bloodedIds = personIds.filter((id) => blooded.has(id));

  const elk = new ELK();
  const layout =
    bloodedIds.length > 0
      ? await elk.layout({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "DOWN",
            "elk.spacing.nodeNode": String(SIBLING_GAP),
            "elk.layered.spacing.nodeNodeBetweenLayers": String(ROW_GAP),
          },
          children: bloodedIds.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
          edges: parentEdges.map((edge, index) => ({
            id: `parent-${index}`,
            sources: [edge.parentId],
            targets: [edge.childId],
          })),
        })
      : { children: [] };

  const positions = new Map<string, { x: number; y: number }>();
  for (const child of layout.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: rowY(child.id) });
  }
  if (!positions.has(rootId)) {
    positions.set(rootId, { x: 0, y: rowY(rootId) });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [a, b] of spouseEdges) {
      for (const [personId, partnerId] of [
        [a, b],
        [b, a],
      ] as const) {
        if (positions.has(personId) || !positions.has(partnerId)) continue;
        const partner = positions.get(partnerId)!;
        positions.set(personId, { x: partner.x + NODE_WIDTH + SPOUSE_GAP, y: partner.y });
        changed = true;
      }
    }
  }

  return positions;
}
