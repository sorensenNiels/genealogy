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
