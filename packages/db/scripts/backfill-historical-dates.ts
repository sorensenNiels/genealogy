/**
 * One-off backfill: re-resolves `earliest`/`latest` on every stored
 * `HistoricalDate` from its `original` wording, using the current
 * `parseHistoricalDate`. Not a schema migration (no `db:migrate` involvement)
 * and not wired into `package.json` scripts, to avoid an accidental run —
 * invoke it directly:
 *
 *   pnpm --filter @genealogy/core build   # if dist/ is stale
 *   DATABASE_URL=postgres://... node packages/db/scripts/backfill-historical-dates.ts
 *
 * Imports the *built* `@genealogy/core` package, not source, so its own
 * `dist/` must be current.
 *
 * Runs unconditionally over every row with a non-empty `original`, not just
 * rows whose bounds are still null — `parseHistoricalDate` is a pure
 * function of `original` alone, so re-running it can only improve a row
 * (e.g. now understanding a range it previously couldn't), never regress
 * one, and the whole thing is idempotent to re-run.
 */
import { parseHistoricalDate, type HistoricalDate } from "@genealogy/core";
import { Pool } from "pg";

interface DateColumn {
  table: string;
  column: string;
  idColumn: string;
}

const DATE_COLUMNS: DateColumn[] = [
  { table: "persons", column: "birth", idColumn: "id" },
  { table: "persons", column: "death", idColumn: "id" },
  { table: "person_events", column: "date", idColumn: "id" },
  { table: "unions", column: "start_date", idColumn: "id" },
  { table: "unions", column: "end_date", idColumn: "id" },
];

async function backfillColumn(pool: Pool, { table, column, idColumn }: DateColumn): Promise<void> {
  const { rows } = await pool.query<{ id: string; value: HistoricalDate }>(
    `SELECT ${idColumn} AS id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`,
  );

  let updated = 0;
  for (const row of rows) {
    const original = row.value.original;
    if (!original) continue;
    const bounds = parseHistoricalDate(original);
    const next: HistoricalDate = { original, ...bounds };
    if (next.earliest === row.value.earliest && next.latest === row.value.latest) continue;

    await pool.query(`UPDATE ${table} SET ${column} = $1 WHERE ${idColumn} = $2`, [
      JSON.stringify(next),
      row.id,
    ]);
    updated++;
  }

  console.log(`${table}.${column}: ${updated}/${rows.length} rows updated`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    for (const dateColumn of DATE_COLUMNS) {
      await backfillColumn(pool, dateColumn);
    }
  } finally {
    await pool.end();
  }
}

await main();
