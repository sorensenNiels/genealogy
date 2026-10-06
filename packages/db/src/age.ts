import type { Pool, PoolClient } from "pg";

/** Must match the graph created in postgres/01-init-age.sql. */
export const DEFAULT_GRAPH = "family_tree";

/**
 * AGE is a loadable extension, not just a set of catalogue entries: until a
 * session has run `LOAD 'age'`, it cannot parse `agtype` and `cypher()` is
 * invisible. node-postgres hands out pooled connections that outlive a single
 * query, so we track which physical connections have been prepared. A WeakSet
 * is right here — when the pool discards a connection, the entry goes with it.
 */
const preparedClients = new WeakSet<PoolClient>();

export async function prepareAgeClient(client: PoolClient): Promise<void> {
  if (preparedClients.has(client)) return;
  await client.query("LOAD 'age'");
  // `public` first, deliberately: unqualified DDL must land in the application
  // schema, not in AGE's catalogue. Every AGE reference in this package is
  // fully qualified (`ag_catalog.cypher`, `ag_catalog.agtype`), so ag_catalog
  // only needs to be reachable, not first.
  await client.query("SET search_path = public, ag_catalog");
  preparedClients.add(client);
}

/** Runs `fn` on a connection guaranteed to have AGE loaded. */
export async function withGraphClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await prepareAgeClient(client);
    return await fn(client);
  } finally {
    client.release();
  }
}

// AGE parses the graph name, the query body and the result column list at plan
// time, so none of the three can be a bound parameter — they are spliced into
// the SQL text. Everything that varies per call must travel through `params`
// instead. These guards make that boundary impossible to cross by accident.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(value: string, what: string): void {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid ${what}: ${JSON.stringify(value)}`);
  }
}

/**
 * An `agtype` scalar, or a vertex/edge/path. AGE returns the latter as JSON
 * with a trailing `::vertex`-style annotation that JSON.parse cannot digest.
 */
const AGTYPE_ANNOTATION = /::(?:vertex|edge|path)$/;

export function parseAgtype<T = unknown>(raw: string | null): T | null {
  if (raw === null) return null;
  const stripped = raw.replace(AGTYPE_ANNOTATION, "");
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // A bare unquoted scalar AGE chose not to JSON-encode.
    return stripped as unknown as T;
  }
}

export interface AgeVertex<P = Record<string, unknown>> {
  id: number;
  label: string;
  properties: P;
}

export interface CypherOptions {
  graph?: string;
  /** Bound values, referenced inside the query as `$name`. */
  params?: Record<string, unknown>;
  /** Reuse an existing prepared connection, e.g. inside a transaction. */
  client?: PoolClient;
}

/**
 * Runs a Cypher query and returns one object per row, keyed by `columns`, with
 * every value already decoded from agtype.
 *
 * `query` is code, never user input — it is spliced into the SQL. User values
 * belong in `options.params`.
 *
 * ```ts
 * await cypher(pool, "MATCH (p:Person {id: $id}) RETURN p", ["p"], {
 *   params: { id: personId },
 * });
 * ```
 */
export async function cypher<T = Record<string, unknown>>(
  pool: Pool,
  query: string,
  columns: readonly string[],
  options: CypherOptions = {},
): Promise<T[]> {
  const graph = options.graph ?? DEFAULT_GRAPH;
  assertIdentifier(graph, "graph name");
  if (columns.length === 0) {
    throw new Error("cypher() needs at least one return column");
  }
  for (const column of columns) assertIdentifier(column, "result column");
  if (query.includes("$$")) {
    throw new Error("Cypher query may not contain '$$' — it terminates the SQL dollar quote");
  }

  // Quoted, or Postgres folds an unquoted identifier to lower case: a
  // `childId` column would come back keyed `childid`, and `row[column]` below
  // would silently read `undefined` → null for every row. Safe to quote —
  // `assertIdentifier` above already restricts each name to [A-Za-z0-9_].
  const columnList = columns.map((column) => `"${column}" ag_catalog.agtype`).join(", ");
  const sql = `SELECT * FROM ag_catalog.cypher('${graph}', $$${query}$$, $1) AS (${columnList})`;
  const values = [JSON.stringify(options.params ?? {})];

  const run = async (client: PoolClient): Promise<T[]> => {
    const result = await client.query<Record<string, string | null>>(sql, values);
    return result.rows.map((row) => {
      const decoded: Record<string, unknown> = {};
      for (const column of columns) decoded[column] = parseAgtype(row[column] ?? null);
      return decoded as T;
    });
  };

  if (options.client) {
    return run(options.client);
  }
  return withGraphClient(pool, run);
}
