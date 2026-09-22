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
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // node-postgres emits "error" on the pool when an idle client's connection
  // is dropped by the server (e.g. a restart, or the backend killing an
  // idle connection). With no listener, Node treats that as an uncaught
  // exception and crashes the whole process — every in-flight request dies
  // with it, which looks like a hang to whoever's waiting on it, not like a
  // crash.
  pool.on("error", (error) => {
    console.error("Unexpected error on idle Postgres client", error);
  });

  return pool;
}

/**
 * Accepts a checked-out `PoolClient` as well as the pool, which is what lets a
 * Drizzle write join an open Cypher transaction (see `inGraphTransaction`).
 */
export function createDatabase(connection: Pool | PoolClient): Database {
  return drizzle(connection, { schema });
}
