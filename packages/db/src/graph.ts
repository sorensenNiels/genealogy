import type { Parentage, PedigreeNode } from "@genealogy/core";
import type { Pool, PoolClient } from "pg";

import { cypher, prepareAgeClient, type AgeVertex, type CypherOptions } from "./age.js";

interface PersonNodeProps {
  id: string;
}

/**
 * Creates the graph node mirroring a `persons` row, or leaves it alone if it is
 * already there. Call this in the same transaction as the relational insert.
 */
export async function upsertPersonNode(
  pool: Pool,
  personId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  await cypher(pool, "MERGE (p:Person {id: $id}) RETURN p", ["p"], {
    ...options,
    params: { id: personId },
  });
}

export async function addParentOf(
  pool: Pool,
  parentId: string,
  childId: string,
  parentage: Parentage = "unknown",
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  await cypher(
    pool,
    `MATCH (parent:Person {id: $parentId}), (child:Person {id: $childId})
     MERGE (parent)-[r:PARENT_OF]->(child)
     SET r.parentage = $parentage
     RETURN r`,
    ["r"],
    { ...options, params: { parentId, childId, parentage } },
  );
}

/**
 * Whether any `PARENT_OF` edge currently uses this parentage key — checked
 * before letting Settings delete the configurable option it belongs to,
 * since a graph edge property isn't a foreign key Postgres can guard for us.
 */
export async function parentageInUse(
  pool: Pool,
  key: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<boolean> {
  const rows = await cypher<{ count: number }>(
    pool,
    `MATCH ()-[r:PARENT_OF {parentage: $key}]->()
     RETURN count(r) AS count`,
    ["count"],
    { ...options, params: { key } },
  );
  return (rows[0]?.count ?? 0) > 0;
}

export interface ParentEdge {
  personId: string;
  parentage: Parentage;
}

/**
 * Direct parents only, with the parentage recorded on each edge. Separate from
 * `ancestorsOf` because that walk can span several generations through several
 * edges, each with its own `parentage` — there is no single value to report
 * for a multi-hop ancestor, only for a direct parent.
 */
export async function parentsOf(
  pool: Pool,
  personId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<ParentEdge[]> {
  const rows = await cypher<{ parent: AgeVertex<PersonNodeProps>; parentage: Parentage }>(
    pool,
    `MATCH (parent:Person)-[r:PARENT_OF]->(:Person {id: $id})
     RETURN parent, r.parentage AS parentage`,
    ["parent", "parentage"],
    { ...options, params: { id: personId } },
  );
  return rows.map((row) => ({ personId: row.parent.properties.id, parentage: row.parentage }));
}

export interface ChildEdge {
  personId: string;
  parentage: Parentage;
}

/**
 * Direct children only, mirroring `parentsOf` in the other direction — used by
 * `treeAround`'s downward walk, which needs the `parentage` on each edge (unlike
 * `descendantsOf`, which only reports generation distance from the root).
 */
export async function childrenOf(
  pool: Pool,
  personId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<ChildEdge[]> {
  const rows = await cypher<{ child: AgeVertex<PersonNodeProps>; parentage: Parentage }>(
    pool,
    `MATCH (:Person {id: $id})-[r:PARENT_OF]->(child:Person)
     RETURN child, r.parentage AS parentage`,
    ["child", "parentage"],
    { ...options, params: { id: personId } },
  );
  return rows.map((row) => ({ personId: row.child.properties.id, parentage: row.parentage }));
}

export async function addSpouseOf(
  pool: Pool,
  aId: string,
  bId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  await cypher(
    pool,
    `MATCH (a:Person {id: $aId}), (b:Person {id: $bId})
     MERGE (a)-[r:SPOUSE_OF]->(b)
     RETURN r`,
    ["r"],
    { ...options, params: { aId, bId } },
  );
}

/**
 * Spouses regardless of which side `addSpouseOf` created the edge from — it
 * only ever writes one directed `SPOUSE_OF` edge, so this match is undirected.
 */
export async function spousesOf(
  pool: Pool,
  personId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<PedigreeNode[]> {
  const rows = await cypher<{ spouse: AgeVertex<PersonNodeProps> }>(
    pool,
    `MATCH (:Person {id: $id})-[:SPOUSE_OF]-(spouse:Person)
     RETURN DISTINCT spouse`,
    ["spouse"],
    { ...options, params: { id: personId } },
  );
  return rows.map((row) => ({ personId: row.spouse.properties.id, generation: 1 }));
}

/**
 * Which of these ids currently have any relationship at all — a parent,
 * child, or spouse edge — checked in one round trip rather than one
 * `relatives()` call per row. Used to decide whether each row in a list of
 * people is safe to delete. Doesn't account for a union that outlived its
 * `SPOUSE_OF` edge (see `unlinkSpouse`); callers that care about that check
 * `unions` separately, same as `PersonService.remove` does.
 *
 * AGE's Cypher doesn't accept `[:PARENT_OF|SPOUSE_OF]` (multi-type patterns),
 * hence the two separate `OPTIONAL MATCH`es rather than one.
 */
export async function personsWithRelations(
  pool: Pool,
  personIds: readonly string[],
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const rows = await cypher<{ id: string }>(
    pool,
    `UNWIND $ids AS pid
     MATCH (p:Person {id: pid})
     OPTIONAL MATCH (p)-[r:PARENT_OF]-()
     OPTIONAL MATCH (p)-[s:SPOUSE_OF]-()
     WITH p, r, s
     WHERE r IS NOT NULL OR s IS NOT NULL
     RETURN DISTINCT p.id AS id`,
    ["id"],
    { ...options, params: { ids: personIds } },
  );
  return new Set(rows.map((row) => row.id));
}

/**
 * Everyone's ancestors at their closest generation (1 = parents), walked one
 * generation at a time with a seen-set rather than a variable-length match:
 * `ancestorsOf`'s `[:PARENT_OF*1..N]` enumerates every *path*, and with
 * pedigree collapse (cousins marrying, common in rural parishes) the paths
 * multiply with each generation; this visits each ancestor once. A cycle in
 * bad data just stops at the seen-set. One query per generation reached.
 */
export async function ancestorsByGeneration(
  pool: Pool,
  personId: string,
  maxGenerations = 25,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<PedigreeNode[]> {
  const depth = clampDepth(maxGenerations);
  const seen = new Set([personId]);
  const result: PedigreeNode[] = [];
  let frontier = [personId];
  for (let generation = 1; generation <= depth && frontier.length > 0; generation += 1) {
    // One generation depends on the last, so these can't run in parallel.
    // eslint-disable-next-line no-await-in-loop
    const rows = await cypher<{ parentId: string }>(
      pool,
      `UNWIND $ids AS cid
       MATCH (parent:Person)-[:PARENT_OF]->(:Person {id: cid})
       RETURN DISTINCT parent.id AS parentId`,
      ["parentId"],
      { ...options, params: { ids: frontier } },
    );
    frontier = [];
    for (const { parentId } of rows) {
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      result.push({ personId: parentId, generation });
      frontier.push(parentId);
    }
  }
  return result;
}

/**
 * The parents and spouses of each of `personIds`, in two round trips — the
 * People list's detailed rows ("Son of … · ⚭ …") for one page of people,
 * rather than `parentsOf`/`spousesOf` per row. `UNWIND` + `MATCH` on the
 * `id` property, like `personsWithRelations`: a page is at most a couple of
 * hundred people, well within what a label scan per id handles.
 */
export async function familyOf(
  pool: Pool,
  personIds: readonly string[],
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<{
  parents: { childId: string; parentId: string; parentage: Parentage }[];
  spouses: { personId: string; spouseId: string }[];
}> {
  if (personIds.length === 0) return { parents: [], spouses: [] };
  const [parents, spouses] = await Promise.all([
    cypher<{ childId: string; parentId: string; parentage: Parentage }>(
      pool,
      `UNWIND $ids AS pid
       MATCH (parent:Person)-[r:PARENT_OF]->(child:Person {id: pid})
       RETURN child.id AS childId, parent.id AS parentId, r.parentage AS parentage`,
      ["childId", "parentId", "parentage"],
      { ...options, params: { ids: personIds } },
    ),
    cypher<{ personId: string; spouseId: string }>(
      pool,
      `UNWIND $ids AS pid
       MATCH (person:Person {id: pid})-[:SPOUSE_OF]-(spouse:Person)
       RETURN DISTINCT person.id AS personId, spouse.id AS spouseId`,
      ["personId", "spouseId"],
      { ...options, params: { ids: personIds } },
    ),
  ]);
  return { parents, spouses };
}

/** Removes a `PARENT_OF` edge. A no-op if the two were never linked. */
export async function removeParentOf(
  pool: Pool,
  parentId: string,
  childId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  await cypher(
    pool,
    `MATCH (:Person {id: $parentId})-[r:PARENT_OF]->(:Person {id: $childId})
     DELETE r
     RETURN true AS deleted`,
    ["deleted"],
    { ...options, params: { parentId, childId } },
  );
}

/** Removes a `SPOUSE_OF` edge, regardless of which side it was created from. */
export async function removeSpouseOf(
  pool: Pool,
  aId: string,
  bId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  await cypher(
    pool,
    `MATCH (:Person {id: $aId})-[r:SPOUSE_OF]-(:Person {id: $bId})
     DELETE r
     RETURN true AS deleted`,
    ["deleted"],
    { ...options, params: { aId, bId } },
  );
}

/**
 * Removes the `Person` node and any edges touching it. Callers are expected to
 * have already confirmed there are none to remove — see `PersonService.remove`
 * — so this never silently drops relationship data; `DETACH DELETE` is just
 * the belt-and-braces way to word the query, not a license to skip that check.
 */
export async function deletePersonNode(
  pool: Pool,
  personId: string,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  await cypher(
    pool,
    `MATCH (p:Person {id: $id})
     DETACH DELETE p
     RETURN true AS deleted`,
    ["deleted"],
    { ...options, params: { id: personId } },
  );
}

/** Every `Person` node's id — the graph half of the two-store consistency check (`IntegrityService.checkGraphConsistency`), diffed in JS against every `persons.id` in Postgres. No existing function lists the whole graph unfiltered; every other one here takes a specific id or bounded id list. */
export async function allPersonNodeIds(
  pool: Pool,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<string[]> {
  const rows = await cypher<{ id: string }>(
    pool,
    `MATCH (p:Person) RETURN p.id AS id`,
    ["id"],
    options,
  );
  return rows.map((row) => row.id);
}

/** Every `PARENT_OF` edge in the graph — the GEDCOM exporter's source of FAM/CHIL groupings, which needs the whole tree's edges at once rather than one person's parents/children at a time. */
export async function allParentOfEdges(
  pool: Pool,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<{ parentId: string; childId: string; parentage: Parentage }[]> {
  const rows = await cypher<{ parentId: string; childId: string; parentage: Parentage }>(
    pool,
    `MATCH (parent:Person)-[r:PARENT_OF]->(child:Person)
     RETURN parent.id AS parentId, child.id AS childId, r.parentage AS parentage`,
    ["parentId", "childId", "parentage"],
    options,
  );
  return rows;
}

/**
 * Every `PARENT_OF` edge whose both ends are among `personIds` — the links a
 * walk outward from one person can miss between people it did collect: the
 * tree view walks down by asking only the root (then their children, ...)
 * for children, so a spouse it picked up has no edges to the couple's
 * children until this fills them in.
 */
export async function parentEdgesAmong(
  pool: Pool,
  personIds: readonly string[],
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<{ parentId: string; childId: string; parentage: Parentage }[]> {
  if (personIds.length < 2) return [];
  return cypher<{ parentId: string; childId: string; parentage: Parentage }>(
    pool,
    `MATCH (parent:Person)-[r:PARENT_OF]->(child:Person)
     WHERE parent.id IN $ids AND child.id IN $ids
     RETURN parent.id AS parentId, child.id AS childId, r.parentage AS parentage`,
    ["parentId", "childId", "parentage"],
    { ...options, params: { ids: [...personIds] } },
  );
}

/**
 * Every `SPOUSE_OF` edge, once per pair (`addSpouseOf` only ever writes one
 * directed edge) — the GEDCOM exporter needs these on top of `unions` rows,
 * since a couple can be linked as spouses with no union recorded at all.
 */
export async function allSpouseOfEdges(
  pool: Pool,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<{ aId: string; bId: string }[]> {
  return cypher<{ aId: string; bId: string }>(
    pool,
    `MATCH (a:Person)-[:SPOUSE_OF]->(b:Person)
     RETURN a.id AS aId, b.id AS bId`,
    ["aId", "bId"],
    options,
  );
}

/** How many rows one bulk Cypher call carries — keeps the single JSON params blob to a modest size. */
const BULK_CHUNK_SIZE = 2000;

/**
 * Creates one `Person` node per id — for a bulk import of brand-new people,
 * so `CREATE`, not `upsertPersonNode`'s `MERGE`. Returns each node's AGE
 * vertex id (a graphid, well inside `Number.MAX_SAFE_INTEGER`), which is what
 * `addParentOfMany`/`addSpouseOfMany` need to match on instead of the `id`
 * property: AGE has no index on vertex properties, so matching endpoints by
 * `{id: ...}` is a label scan per edge — measured at ~25 s for 5,000 edges
 * against ~50 ms by vertex id, which hits the label table's primary key.
 */
export async function createPersonNodes(
  pool: Pool,
  personIds: readonly string[],
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<Map<string, number>> {
  const vertexIds = new Map<string, number>();
  for (const ids of chunks(personIds, BULK_CHUNK_SIZE)) {
    // Chunks share one transaction's connection — sequential by necessity.
    // eslint-disable-next-line no-await-in-loop
    const rows = await cypher<{ personId: string; vertexId: number }>(
      pool,
      `UNWIND $ids AS pid
       CREATE (p:Person {id: pid})
       RETURN pid AS personId, id(p) AS vertexId`,
      ["personId", "vertexId"],
      { ...options, params: { ids } },
    );
    for (const row of rows) vertexIds.set(row.personId, row.vertexId);
  }
  return vertexIds;
}

/** Bulk `PARENT_OF` creation by vertex id — see `createPersonNodes` for why not by `id` property. Assumes the edges don't exist yet. */
export async function addParentOfMany(
  pool: Pool,
  edges: readonly { parent: number; child: number; parentage: Parentage }[],
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  for (const chunk of chunks(edges, BULK_CHUNK_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await cypher(
      pool,
      `UNWIND $edges AS e
       MATCH (parent:Person), (child:Person)
       WHERE id(parent) = e.parent AND id(child) = e.child
       CREATE (parent)-[r:PARENT_OF {parentage: e.parentage}]->(child)
       RETURN count(r) AS created`,
      ["created"],
      { ...options, params: { edges: chunk } },
    );
  }
}

/** Bulk `SPOUSE_OF` creation by vertex id, one directed edge per pair like `addSpouseOf`. Assumes the edges don't exist yet. */
export async function addSpouseOfMany(
  pool: Pool,
  pairs: readonly { a: number; b: number }[],
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<void> {
  for (const chunk of chunks(pairs, BULK_CHUNK_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await cypher(
      pool,
      `UNWIND $pairs AS s
       MATCH (a:Person), (b:Person)
       WHERE id(a) = s.a AND id(b) = s.b
       CREATE (a)-[r:SPOUSE_OF]->(b)
       RETURN count(r) AS created`,
      ["created"],
      { ...options, params: { pairs: chunk } },
    );
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

/**
 * Walks up the tree. `maxGenerations` is capped rather than optional because a
 * badly-sourced tree can contain a cycle (a person recorded as their own
 * ancestor), and an unbounded variable-length match would never return.
 *
 * Only biological and adoptive links are followed; step and foster links are
 * relationships but not descent paths.
 */
export async function ancestorsOf(
  pool: Pool,
  personId: string,
  maxGenerations = 10,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<PedigreeNode[]> {
  const depth = clampDepth(maxGenerations);
  const rows = await cypher<{ ancestor: AgeVertex<PersonNodeProps>; generation: number }>(
    pool,
    `MATCH path = (ancestor:Person)-[:PARENT_OF*1..${depth}]->(:Person {id: $id})
     RETURN ancestor, length(path) AS generation`,
    ["ancestor", "generation"],
    { ...options, params: { id: personId } },
  );
  return toPedigree(rows, "ancestor");
}

export async function descendantsOf(
  pool: Pool,
  personId: string,
  maxGenerations = 10,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<PedigreeNode[]> {
  const depth = clampDepth(maxGenerations);
  const rows = await cypher<{ descendant: AgeVertex<PersonNodeProps>; generation: number }>(
    pool,
    `MATCH path = (:Person {id: $id})-[:PARENT_OF*1..${depth}]->(descendant:Person)
     RETURN descendant, length(path) AS generation`,
    ["descendant", "generation"],
    { ...options, params: { id: personId } },
  );
  return toPedigree(rows, "descendant");
}

export interface TreeEdge {
  parentId: string;
  childId: string;
  parentage: Parentage;
}

export interface TreeGraph {
  personIds: string[];
  parentEdges: TreeEdge[];
  /** Undirected, each pair reported once. */
  spouseEdges: Array<[string, string]>;
  /**
   * Who we actually asked "who are your parents" / "who are your children" —
   * as opposed to merely appearing in `personIds` because someone else's
   * query happened to mention them. The walk is asymmetric: an ancestor's
   * *parents* are verified (the walk keeps going up from them) but their
   * *other* children — the root's aunts and uncles — never are, and the
   * mirror image holds for descendants. A person reached only via
   * `spouseEdges` (an in-law with no `PARENT_OF` edge of their own in this
   * tree) is asked neither. The tree view uses this to decide whether an
   * "Add father" / "Add child" action is safe to offer (we know the slot is
   * really empty) versus whether to offer "load more" instead (we simply
   * never looked).
   */
  parentsKnownIds: string[];
  childrenKnownIds: string[];
}

/**
 * Everyone and every edge needed to render a tree centered on `personId` for
 * the tree view: ancestors up to `ancestorGenerations`, descendants down to
 * `descendantGenerations`, and the spouses of everyone collected (so a couple
 * who are both blood relatives, or where only one side is, still render next
 * to each other) — see FEATURES.md's "Tree & visualization" entry.
 *
 * Walks one generation at a time in JS via `parentsOf`/`childrenOf` rather
 * than a single variable-length Cypher `MATCH ... -[:PARENT_OF*1..N]->`,
 * deliberately: AGE's `agtype` decoding (`parseAgtype`) only handles a single
 * vertex/edge/path value per column, not the `nodes(path)`/`relationships(path)`
 * list form a path-based query would need to report every intermediate edge —
 * see the comment on `AGTYPE_ANNOTATION` in age.ts. This costs a query per
 * generation instead of one, which is fine at the depths a tree view renders.
 */
export async function treeAround(
  pool: Pool,
  personId: string,
  ancestorGenerations: number,
  descendantGenerations: number,
  options: Pick<CypherOptions, "client" | "graph"> = {},
): Promise<TreeGraph> {
  const upDepth = clampGenerations(ancestorGenerations);
  const downDepth = clampGenerations(descendantGenerations);

  const personIds = new Set<string>([personId]);
  const parentEdgeKeys = new Set<string>();
  const parentEdges: TreeEdge[] = [];

  const walk = async <TEdge extends { personId: string; parentage: Parentage }>(
    startGenerations: number,
    fetchEdges: (id: string) => Promise<TEdge[]>,
    toTreeEdge: (frontierId: string, edge: TEdge) => TreeEdge,
  ): Promise<Set<string>> => {
    const queriedIds = new Set<string>();
    let frontier = [personId];
    for (let generation = 0; generation < startGenerations && frontier.length > 0; generation++) {
      // Each generation's frontier must be resolved before the next can be
      // computed from it — not parallelizable across generations.
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.all(
        frontier.map(async (id) => ({ id, edges: await fetchEdges(id) })),
      );
      const next = new Set<string>();
      for (const { id, edges } of results) {
        queriedIds.add(id);
        for (const edge of edges) {
          const treeEdge = toTreeEdge(id, edge);
          const key = `${treeEdge.parentId}->${treeEdge.childId}`;
          if (!parentEdgeKeys.has(key)) {
            parentEdgeKeys.add(key);
            parentEdges.push(treeEdge);
          }
          personIds.add(edge.personId);
          next.add(edge.personId);
        }
      }
      frontier = [...next];
    }
    return queriedIds;
  };

  const parentsKnownIds = await walk(
    upDepth,
    (id) => parentsOf(pool, id, options),
    (childId, edge) => ({ parentId: edge.personId, childId, parentage: edge.parentage }),
  );
  const childrenKnownIds = await walk(
    downDepth,
    (id) => childrenOf(pool, id, options),
    (parentId, edge) => ({ parentId, childId: edge.personId, parentage: edge.parentage }),
  );

  const spouseEdgeKeys = new Set<string>();
  const spouseEdges: Array<[string, string]> = [];
  const spouseResults = await Promise.all(
    [...personIds].map(async (id) => ({ id, spouses: await spousesOf(pool, id, options) })),
  );
  for (const { id, spouses } of spouseResults) {
    for (const spouse of spouses) {
      const key = [id, spouse.personId].toSorted().join("|");
      if (spouseEdgeKeys.has(key)) continue;
      spouseEdgeKeys.add(key);
      spouseEdges.push([id, spouse.personId]);
      personIds.add(spouse.personId);
    }
  }

  // The walks only follow edges from the people they queried, so a spouse
  // collected above has no edges to the couple's children yet (nor a child's
  // spouse to the grandchildren). Fill in every parent link between people
  // already collected — without collecting anyone new, so the tree's reach
  // is unchanged.
  for (const edge of await parentEdgesAmong(pool, [...personIds], options)) {
    const key = `${edge.parentId}->${edge.childId}`;
    if (parentEdgeKeys.has(key)) continue;
    parentEdgeKeys.add(key);
    parentEdges.push(edge);
  }

  return {
    personIds: [...personIds],
    parentEdges,
    spouseEdges,
    parentsKnownIds: [...parentsKnownIds],
    childrenKnownIds: [...childrenKnownIds],
  };
}

/**
 * The depth is spliced into the Cypher text because AGE will not accept a bound
 * parameter inside a variable-length pattern, so it must be a trusted integer.
 */
function clampDepth(requested: number): number {
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error(`maxGenerations must be a positive integer, got ${requested}`);
  }
  return Math.min(requested, 25);
}

/** Like `clampDepth`, but 0 is valid — `treeAround` walks generation by generation in JS, not Cypher. */
function clampGenerations(requested: number): number {
  if (!Number.isInteger(requested) || requested < 0) {
    throw new Error(`generations must be a non-negative integer, got ${requested}`);
  }
  return Math.min(requested, 25);
}

function toPedigree<K extends string>(
  rows: Array<Record<K, AgeVertex<PersonNodeProps>> & { generation: number }>,
  key: K,
): PedigreeNode[] {
  // Pedigree collapse (cousins marrying) means the same person can be reached
  // by several paths. Keep the shortest, which is the closest relationship.
  const closest = new Map<string, number>();
  for (const row of rows) {
    const id = row[key].properties.id;
    const existing = closest.get(id);
    if (existing === undefined || row.generation < existing) {
      closest.set(id, row.generation);
    }
  }
  return [...closest.entries()]
    .map(([personId, generation]) => ({ personId, generation }))
    .toSorted((a, b) => a.generation - b.generation || a.personId.localeCompare(b.personId));
}

/** Runs relational and graph writes together so the two halves cannot diverge. */
export async function inGraphTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await prepareAgeClient(client);
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
