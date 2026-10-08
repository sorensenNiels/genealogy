/**
 * Markdown → readable plain text, for writing notes to GEDCOM: other
 * programs show a NOTE verbatim, so `**bold**` and `# Heading` would appear
 * with their markup. Covers what this app's `MarkdownEditor` (MDXEditor)
 * produces — headings, emphasis, links, lists, quotes, code, rules, and its
 * backslash escapes — rather than all of CommonMark; anything it doesn't
 * recognize passes through unchanged, so the worst case is stray markup, never
 * lost words. Hand-rolled rather than a dependency for that reason: it's a
 * few dozen lines, and the GEDCOM exporter is already dependency-free.
 */
export function markdownToPlainText(markdown: string): string {
  const lines: string[] = [];
  let inFence = false;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      lines.push(line);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      lines.push("");
      continue;
    }
    lines.push(
      inline(
        line
          .replace(/^\s{0,3}#{1,6}\s+/, "")
          .replace(/^\s*>\s?/, "")
          .replace(/^(\s*)[*+]\s+/, "$1- "),
      ),
    );
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inline(text: string): string {
  return (
    text
      // Images, then links: keep the words, and a link's address when it isn't the words themselves.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label: string, url: string) =>
        label === url ? url : `${label} (${url})`,
      )
      .replace(/<(https?:\/\/[^>]+)>/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
      .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "$1")
      // Single * or _ only when it wraps a word — snake_case and 2 * 3 stay intact.
      .replace(/(^|[^\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])/g, "$1$2")
      .replace(/(^|[^\w])_(?=\S)([^_]+?)(?<=\S)_(?!\w)/g, "$1$2")
      .replace(/<\/?(?:u|b|i|em|strong|span)[^>]*>/gi, "")
      .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1")
  );
}
