import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Full-text search over the free text people write into the tree — notes,
 * citations, events, records — through Postgres' own text search, with one
 * GIN expression index per searched table (see `schema.ts`).
 *
 * The `simple` configuration, not `danish` or `english`: the tree mixes
 * Danish records with English notes, and a stemmer for one language
 * mangles the other ("Brande" stemmed as English, "died" as Danish). Simple
 * lower-cases and splits on word boundaries, nothing more; prefix matching
 * (`searchQuery`) covers most of what stemming would have — "fød" finds
 * "født" and "fødsel".
 *
 * Index and query must use the *same* expression for the index to be used,
 * which is why both are built by `searchVector` here rather than written
 * out twice.
 */

/** The searched columns joined into one document; a null column is just skipped. */
export function searchDocument(...columns: SQLWrapper[]): SQL {
  return sql.join(
    columns.map((column) => sql`coalesce(${column}, '')`),
    sql` || ' ' || `,
  );
}

export function searchVector(...columns: SQLWrapper[]): SQL {
  return sql`to_tsvector('simple', ${searchDocument(...columns)})`;
}

/**
 * What someone typed, as a `to_tsquery` string: every word must match, each
 * as a prefix. Only letters and digits survive (`\p{L}` covers æ/ø/å), so
 * the text can't carry tsquery operators or syntax errors into the query —
 * it's still passed as a bound parameter, this just keeps it parseable.
 * `null` when nothing searchable is left.
 */
export function searchQuery(input: string): string | null {
  const words = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
  if (words.length === 0) return null;
  return words.map((word) => `${word}:*`).join(" & ");
}

type Columns<K extends string> = Record<K, SQLWrapper>;

/**
 * Which columns of each table are searched — the one definition both the
 * GIN index in `schema.ts` and the search query in the backend build their
 * `searchVector` from, so the two can't drift apart and leave a query that
 * no index serves. Typed structurally rather than against the tables, so
 * `schema.ts` can use it inside its own table definitions.
 */
export const SEARCHED_COLUMNS = {
  persons: (table: Columns<"notes">) => [table.notes],
  personNames: (table: Columns<"notes">) => [table.notes],
  personEvents: (table: Columns<"label" | "place" | "notes">) => [
    table.label,
    table.place,
    table.notes,
  ],
  unions: (table: Columns<"startPlace" | "endPlace" | "notes">) => [
    table.startPlace,
    table.endPlace,
    table.notes,
  ],
  associations: (table: Columns<"associateName" | "label" | "notes">) => [
    table.associateName,
    table.label,
    table.notes,
  ],
  researchNotes: (table: Columns<"body">) => [table.body],
  citations: (table: Columns<"page" | "volume" | "entryId" | "certificateNumber" | "note">) => [
    table.page,
    table.volume,
    table.entryId,
    table.certificateNumber,
    table.note,
  ],
  records: (table: Columns<"place" | "address" | "reference" | "page" | "notes">) => [
    table.place,
    table.address,
    table.reference,
    table.page,
    table.notes,
  ],
  recordPeople: (table: Columns<"name" | "occupation" | "residence" | "birthplace">) => [
    table.name,
    table.occupation,
    table.residence,
    table.birthplace,
  ],
} as const;
