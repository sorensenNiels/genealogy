import { micromark } from "micromark";

/**
 * A note's markdown as HTML — micromark, the parser under the app's
 * `MarkdownContent` (react-markdown), so a note reads the same on the site
 * as in the app. Its defaults are the safety: raw HTML in a note is escaped,
 * not passed through, and `javascript:`-style link targets are dropped.
 * Null for an empty note, so the page leaves the section out.
 */
export function markdownToHtml(markdown: string | null | undefined): string | null {
  if (!markdown || markdown.trim() === "") return null;
  return micromark(markdown);
}
