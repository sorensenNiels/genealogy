import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import { schema } from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

/**
 * One pool serves both halves of the store: Drizzle for the relational tables
 * and raw Cypher for the AGE graph. Sharing it is what lets a single
 * transaction write a person row and their graph node atomically.
 */
export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Accepts a checked-out `PoolClient` as well as the pool, which is what lets a
 * Drizzle write join an open Cypher transaction (see `inGraphTransaction`).
 */
export function createDatabase(connection: Pool | PoolClient): Database {
  return drizzle(connection, { schema });
}
