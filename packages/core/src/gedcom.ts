import { parseHistoricalDateDetailed, type ParsedDatePart } from "./historical-date.js";
import type { HistoricalDate } from "./person.js";

const GEDCOM_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function gedcomDatePart(part: ParsedDatePart): string {
  if (part.precision === "day" && part.month !== null && part.day !== null) {
    return `${part.day} ${GEDCOM_MONTHS[part.month - 1]} ${part.year}`;
  }
  if (part.precision === "month" && part.month !== null) {
    return `${GEDCOM_MONTHS[part.month - 1]} ${part.year}`;
  }
  return `${part.year}`;
}

/**
 * Maps this app's own free-text date wording onto GEDCOM's date grammar
 * (`ABT`/`BEF`/`AFT`/`BET ... AND ...`), by re-running the same
 * `parseHistoricalDateDetailed` this app already uses for display/sorting —
 * not a second parser. `from-to` has no direct GEDCOM equivalent, so it
 * falls back to the non-standard but widely-tolerated `FROM ... TO ...`
 * phrase; `unparsed` falls back to the original wording verbatim, since
 * GEDCOM readers generally show an unrecognized date string as-is rather
 * than rejecting the record. Same "first pass, not full GEDCOM date
 * grammar" scope as the parser itself — no double-dating, no calendar
 * escapes.
 */
export function toGedcomDate(date: HistoricalDate): string {
  const parsed = parseHistoricalDateDetailed(date.original);
  switch (parsed.kind) {
    case "exact":
      return gedcomDatePart(parsed.date);
    case "about":
      return `ABT ${gedcomDatePart(parsed.date)}`;
    case "before":
      return `BEF ${gedcomDatePart(parsed.date)}`;
    case "after":
      return `AFT ${gedcomDatePart(parsed.date)}`;
    case "between":
      return `BET ${gedcomDatePart(parsed.start)} AND ${gedcomDatePart(parsed.end)}`;
    case "from-to":
      return `FROM ${gedcomDatePart(parsed.start)} TO ${gedcomDatePart(parsed.end)}`;
    case "unparsed":
      return date.original;
  }
}

/**
 * Wraps a record's xref for use as another line's *value* (`1 HUSB @I7@`) —
 * distinct from `GedcomWriter.line`'s own `xref` parameter, which is only
 * for a record's own declaration line (`0 @I1@ INDI`). Mixing the two up
 * produces a line that looks right but isn't valid GEDCOM (a bare `I7`
 * instead of a pointer, or a line that looks like it's declaring a second
 * record).
 */
export function gedcomPointer(xref: string): string {
  return `@${xref}@`;
}

/** GEDCOM 5.5.1's own line-length limit before a value needs a CONC/CONT continuation. */
const MAX_LINE_VALUE_LENGTH = 200;

/**
 * Accumulates GEDCOM lines (`LEVEL [XREF] TAG [VALUE]`), splitting any value
 * over `MAX_LINE_VALUE_LENGTH` into `CONC` continuations (same line,
 * whitespace preserved) and any embedded newline into a `CONT` continuation
 * (a new line in the value) — GEDCOM 5.5.1's own mechanism for multi-line
 * text (`NOTE` bodies mainly), since a raw line value can't contain a
 * newline itself.
 */
export class GedcomWriter {
  private readonly lines: string[] = [];

  /** `xref` renders as ` @xref@` right after the level, matching GEDCOM's `0 @I1@ INDI` shape. */
  line(level: number, tag: string, value?: string, xref?: string): void {
    const prefix = xref ? `${level} @${xref}@ ${tag}` : `${level} ${tag}`;
    if (value === undefined || value === "") {
      this.lines.push(prefix);
      return;
    }
    const segments = value.split("\n");
    segments.forEach((segment, segmentIndex) => {
      const continuationPrefix = segmentIndex === 0 ? prefix : `${level + 1} CONT`;
      let remaining = segment;
      let first = true;
      do {
        const chunk = remaining.slice(0, MAX_LINE_VALUE_LENGTH);
        remaining = remaining.slice(MAX_LINE_VALUE_LENGTH);
        if (first) {
          this.lines.push(`${continuationPrefix} ${chunk}`);
          first = false;
        } else {
          this.lines.push(`${level + 1} CONC ${chunk}`);
        }
      } while (remaining.length > 0);
    });
  }

  toString(): string {
    return this.lines.join("\n");
  }
}
