import { z } from "zod";

/** Where a full-text search hit was found — the frontend labels and links each kind its own way. */
export const searchHitKindSchema = z.enum([
  "personNote",
  "name",
  "event",
  "union",
  "association",
  "researchNote",
  "citation",
  "record",
  "recordPerson",
]);
export type SearchHitKind = z.infer<typeof searchHitKindSchema>;

export const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(200),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

/**
 * Wraps each matched word in a search snippet. Private-use characters, so
 * no text a person typed can contain them — the frontend splits on them to
 * render `<mark>` without ever treating the snippet as HTML.
 */
export const SEARCH_MATCH_START = "";
export const SEARCH_MATCH_END = "";

/** A snippet split into plain and matched runs, for rendering. */
export function splitSearchSnippet(snippet: string): { text: string; match: boolean }[] {
  const parts: { text: string; match: boolean }[] = [];
  for (const [index, chunk] of snippet.split(SEARCH_MATCH_START).entries()) {
    if (index === 0) {
      if (chunk) parts.push({ text: chunk, match: false });
      continue;
    }
    const [matched = "", rest = ""] = chunk.split(SEARCH_MATCH_END);
    if (matched) parts.push({ text: matched, match: true });
    if (rest) parts.push({ text: rest, match: false });
  }
  return parts;
}
