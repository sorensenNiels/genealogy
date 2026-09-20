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
    ["a", "b", "r"],
    { ...options, params: { aId, bId } },
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
