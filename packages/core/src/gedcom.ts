import { z } from "zod";

import { parseHistoricalDateDetailed, type ParsedDatePart } from "./historical-date.js";
import type { HistoricalDate } from "./person.js";

/** Which GEDCOM the exporter writes. 5.5.1 is still what most programs read best; 7.0 is the current standard. */
export const gedcomVersionSchema = z.enum(["5.5.1", "7.0"]);
export type GedcomVersion = z.infer<typeof gedcomVersionSchema>;

export const gedcomExportInputSchema = z.object({ version: gedcomVersionSchema.default("5.5.1") });

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

/**
 * One date part. A Julian date carries its calendar — `@#DJULIAN@` in 5.5.1,
 * `JULIAN` in 7.0. A double year stays double in 5.5.1; GEDCOM 7 dropped
 * double years, so there it's the new-style year and the wording as written
 * goes in a PHRASE (see `gedcomDatePhrase`).
 */
function gedcomDatePart(part: ParsedDatePart, version: GedcomVersion): string {
  const year = version === "5.5.1" && part.dualYear ? part.dualYear : String(part.year);
  const text =
    part.precision === "day" && part.month !== null && part.day !== null
      ? `${part.day} ${GEDCOM_MONTHS[part.month - 1]} ${year}`
      : part.precision === "month" && part.month !== null
        ? `${GEDCOM_MONTHS[part.month - 1]} ${year}`
        : year;
  if (part.calendar !== "julian") return text;
  return version === "7.0" ? `JULIAN ${text}` : `@#DJULIAN@ ${text}`;
}

/**
 * Maps this app's own free-text date wording onto GEDCOM's date grammar
 * (`ABT`/`BEF`/`AFT`/`BET ... AND ...`), by re-running the same
 * `parseHistoricalDateDetailed` this app already uses for display/sorting —
 * not a second parser. `from-to` has no direct GEDCOM equivalent, so it
 * falls back to the non-standard but widely-tolerated `FROM ... TO ...`
 * phrase; `unparsed` falls back to the original wording verbatim, since
 * GEDCOM readers generally show an unrecognized date string as-is rather
 * than rejecting the record. Julian dates and double years round-trip (see
 * `gedcomDatePart`); other calendars are unparsed and so go out verbatim.
 */
export function toGedcomDate(date: HistoricalDate, version: GedcomVersion = "5.5.1"): string {
  const parsed = parseHistoricalDateDetailed(date.original);
  const part = (p: ParsedDatePart) => gedcomDatePart(p, version);
  switch (parsed.kind) {
    case "exact":
      return part(parsed.date);
    case "about":
      return `ABT ${part(parsed.date)}`;
    case "before":
      return `BEF ${part(parsed.date)}`;
    case "after":
      return `AFT ${part(parsed.date)}`;
    case "between":
      return `BET ${part(parsed.start)} AND ${part(parsed.end)}`;
    case "from-to":
      return `FROM ${part(parsed.start)} TO ${part(parsed.end)}`;
    case "unparsed":
      // GEDCOM 7 only allows its date grammar in DATE; free text is a PHRASE.
      return version === "7.0" ? "" : date.original;
  }
}

/**
 * GEDCOM 7's `PHRASE` under a DATE — the wording as written, when the DATE
 * value alone can't carry it: free text that isn't a date, or a double year.
 * Always null for 5.5.1, whose DATE carries both directly.
 */
export function gedcomDatePhrase(date: HistoricalDate, version: GedcomVersion): string | null {
  if (version === "5.5.1") return null;
  const parsed = parseHistoricalDateDetailed(date.original);
  if (parsed.kind === "unparsed") return date.original;
  const parts = "date" in parsed ? [parsed.date] : [parsed.start, parsed.end];
  return parts.some((p) => p.dualYear) ? date.original : null;
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

  /**
   * GEDCOM 7 has no CONC (no line-length limit), only CONT for a new line;
   * 5.5.1 splits long values with CONC.
   */
  constructor(private readonly version: GedcomVersion = "5.5.1") {}

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
      const limit = this.version === "7.0" ? Infinity : MAX_LINE_VALUE_LENGTH;
      do {
        const chunk = remaining.slice(0, limit);
        remaining = remaining.slice(limit);
        if (first) {
          // An empty line (a blank line in a note) has no payload, and so no
          // trailing space — GEDCOM 7 forbids one.
          this.lines.push(chunk === "" ? continuationPrefix : `${continuationPrefix} ${chunk}`);
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
