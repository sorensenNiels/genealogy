import { z } from "zod";

import type { ConfigurableTopic } from "./configurable-options.js";
import { parseHistoricalDate, parseHistoricalDateDetailed } from "./historical-date.js";
import type { PersonExternalIdSystem } from "./person-external-id.js";
import type { Gender, HistoricalDate, PersonRestriction } from "./person.js";

/*
 * GEDCOM 5.5.1 import, framework-free: bytes → text → line tree → an import
 * *plan* (plain rows keyed by the file's own xrefs). Nothing here touches a
 * database — apps/backend's `GedcomImportService` turns a plan into inserts,
 * which keeps every mapping decision below unit-testable on its own. See
 * "GEDCOM import" in TECH_STACK.md for the scope cuts (everything is imported
 * as new people; matching against the existing tree is only reported, never
 * acted on).
 */

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

// A web-platform global (every browser, Node ≥ 11), but this package compiles
// against the bare ES2023 lib — no DOM or Node types, and TypeScript 6 no
// longer pulls in @types/node implicitly. Declared locally, only as much as
// is used, rather than adding either type set to a framework-free package.
declare const TextDecoder: new (
  label?: string,
  options?: { fatal?: boolean },
) => { decode(input: Uint8Array): string };

export const gedcomEncodingSchema = z.enum([
  "utf-8",
  "utf-16le",
  "utf-16be",
  "windows-1252",
  "ansel",
]);
export type GedcomEncoding = z.infer<typeof gedcomEncodingSchema>;

/**
 * Generous for a family tree — a 10,000-person GEDCOM is typically 3–6 MB —
 * while still bounding what one request makes the backend parse in memory.
 */
export const GEDCOM_IMPORT_MAX_CHARS = 30_000_000;

/** What the browser sends for both preview and import: already-decoded text, plus how it was decoded (for the legacy-encoding warning). */
export const gedcomImportInputSchema = z.object({
  text: z.string().min(1).max(GEDCOM_IMPORT_MAX_CHARS),
  encoding: gedcomEncodingSchema.optional(),
});
export type GedcomImportInput = z.infer<typeof gedcomImportInputSchema>;

/**
 * Turns a file's raw bytes into text. Runs in the browser before upload, so
 * the server only ever sees a plain string. UTF-8 (with or without BOM) and
 * UTF-16 cover every modern exporter (FamilySearch, Ancestry, MyHeritage,
 * Gramps). Anything that isn't valid UTF-8 is either ANSEL — GEDCOM 5.5's
 * own legacy charset, used when the header says `1 CHAR ANSEL` — or else
 * Windows-1252, the usual "ANSI" of older Windows programs. A file that
 * *declares* ANSEL but is valid UTF-8 is read as UTF-8: mislabelled UTF-8 is
 * far more common in the wild than genuine ANSEL that happens to form valid
 * UTF-8 byte sequences.
 */
export function decodeGedcomBytes(bytes: Uint8Array): { text: string; encoding: GedcomEncoding } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  }
  // A GEDCOM file always starts with "0 HEAD", so a BOM-less UTF-16 file
  // still shows itself by the NUL byte next to that leading "0".
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x30 && bytes[1] === 0x00)) {
    return { text: stripBom(new TextDecoder("utf-16le").decode(bytes)), encoding: "utf-16le" };
  }
  if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0x00 && bytes[1] === 0x30)) {
    return { text: stripBom(new TextDecoder("utf-16be").decode(bytes)), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    if (declaresAnsel(bytes)) return { text: decodeAnsel(bytes), encoding: "ansel" };
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** Whether the HEAD record declares `CHAR ANSEL` — read from the bytes, since the header is plain ASCII in every charset this handles. */
function declaresAnsel(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  return /^\s*1\s+CHAR\s+ANSEL\s*$/im.test(head);
}

/**
 * ANSEL (ANSI Z39.47) as GEDCOM 5.5 uses it: ASCII below 0x80, a block of
 * spacing letters and symbols (Ø, Æ, Þ, ...) at 0xA1–0xCF, and combining
 * diacritics at 0xE0–0xFE. GEDCOM's additions to plain ANSEL are included
 * (0xBE/0xBF boxes, 0xC7/0xCF ß, 0xC8 €, 0xCD/0xCE midline e/o).
 */
const ANSEL_SPACING: Record<number, string> = {
  0xa1: "Ł",
  0xa2: "Ø",
  0xa3: "Đ",
  0xa4: "Þ",
  0xa5: "Æ",
  0xa6: "Œ",
  0xa7: "ʹ",
  0xa8: "·",
  0xa9: "♭",
  0xaa: "®",
  0xab: "±",
  0xac: "Ơ",
  0xad: "Ư",
  0xae: "ʼ",
  0xb0: "ʻ",
  0xb1: "ł",
  0xb2: "ø",
  0xb3: "đ",
  0xb4: "þ",
  0xb5: "æ",
  0xb6: "œ",
  0xb7: "ʺ",
  0xb8: "ı",
  0xb9: "£",
  0xba: "ð",
  0xbc: "ơ",
  0xbd: "ư",
  0xbe: "□",
  0xbf: "■",
  0xc0: "°",
  0xc1: "ℓ",
  0xc2: "℗",
  0xc3: "©",
  0xc4: "♯",
  0xc5: "¿",
  0xc6: "¡",
  0xc7: "ß",
  0xc8: "€",
  0xcd: "e",
  0xce: "o",
  0xcf: "ß",
};
const ANSEL_COMBINING: Record<number, string> = {
  0xe0: "\u0309",
  0xe1: "\u0300",
  0xe2: "\u0301",
  0xe3: "\u0302",
  0xe4: "\u0303",
  0xe5: "\u0304",
  0xe6: "\u0306",
  0xe7: "\u0307",
  0xe8: "\u0308",
  0xe9: "\u030c",
  0xea: "\u030a",
  0xeb: "\ufe20",
  0xec: "\ufe21",
  0xed: "\u0315",
  0xee: "\u030b",
  0xef: "\u0310",
  0xf0: "\u0327",
  0xf1: "\u0328",
  0xf2: "\u0323",
  0xf3: "\u0324",
  0xf4: "\u0325",
  0xf5: "\u0333",
  0xf6: "\u0332",
  0xf7: "\u0326",
  0xf8: "\u031c",
  0xf9: "\u032e",
  0xfa: "\ufe22",
  0xfb: "\ufe23",
  0xfe: "\u0313",
};

/**
 * ANSEL puts a combining diacritic *before* the letter it modifies
 * (0xEA 0x61 = å); Unicode puts it after. So pending diacritics are held
 * until the next base character and appended to it, then everything is
 * NFC-normalized into precomposed letters where Unicode has them. A byte
 * with no mapping becomes U+FFFD rather than silently vanishing.
 */
export function decodeAnsel(bytes: Uint8Array): string {
  let out = "";
  let pending = "";
  for (const byte of bytes) {
    const combining = ANSEL_COMBINING[byte];
    if (combining) {
      pending += combining;
      continue;
    }
    const base = byte < 0x80 ? String.fromCharCode(byte) : (ANSEL_SPACING[byte] ?? "\ufffd");
    out += base + pending;
    pending = "";
  }
  return (out + pending).normalize("NFC");
}

function stripBom(text: string): string {
  return text.startsWith("﻿") ? text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// Line parsing
// ---------------------------------------------------------------------------

export interface GedcomNode {
  tag: string;
  /** The record's own id, without the surrounding `@`s — only level-0 records have one. */
  xref: string | null;
  /** CONC/CONT continuations already folded in; `@@` already unescaped. */
  value: string;
  /** 1-based, for warnings. */
  line: number;
  children: GedcomNode[];
}

export interface ParsedGedcom {
  records: GedcomNode[];
  /** Line numbers that couldn't be read as `LEVEL [@XREF@] TAG [VALUE]`, or skipped a level. */
  malformedLines: number[];
}

// Lenient about surrounding whitespace (several exporters indent by level),
// strict about the shape itself.
const GEDCOM_LINE = /^\s*(\d{1,2})\s+(?:@([^@\s]+)@\s+)?([A-Za-z0-9_]+)(?: (.*))?$/;

/**
 * Builds the level-nested record tree. CONC (same line) and CONT (new line)
 * continuations are folded into their parent's value here, so nothing
 * downstream ever sees them — the mirror image of `GedcomWriter.line`.
 */
export function parseGedcom(text: string): ParsedGedcom {
  const records: GedcomNode[] = [];
  const malformedLines: number[] = [];
  // stack[level] is the most recent node at that level.
  let stack: GedcomNode[] = [];

  const lines = stripBom(text).split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (raw.trim() === "") return;
    const match = GEDCOM_LINE.exec(raw);
    if (!match) {
      malformedLines.push(lineNumber);
      return;
    }
    const level = Number(match[1]);
    const tag = (match[3] ?? "").toUpperCase();
    const rawValue = match[4] ?? "";
    // A pointer value (`@I7@`) stays as-is; anywhere else `@@` is GEDCOM's
    // escape for a literal `@`.
    const value = isPointer(rawValue) ? rawValue : rawValue.replaceAll("@@", "@");

    if (level === 0) {
      const node: GedcomNode = {
        tag,
        xref: match[2] ?? null,
        value,
        line: lineNumber,
        children: [],
      };
      records.push(node);
      stack = [node];
      return;
    }
    const parent = stack[level - 1];
    if (!parent || level > stack.length) {
      malformedLines.push(lineNumber);
      return;
    }
    if (tag === "CONC") {
      parent.value += value;
      return;
    }
    if (tag === "CONT") {
      parent.value += `\n${value}`;
      return;
    }
    const node: GedcomNode = { tag, xref: null, value, line: lineNumber, children: [] };
    parent.children.push(node);
    stack.length = level;
    stack.push(node);
  });

  return { records, malformedLines };
}

function isPointer(value: string): boolean {
  return /^@[^@#\s][^@\s]*@$/.test(value.trim());
}

function pointerOf(value: string): string | null {
  const trimmed = value.trim();
  return isPointer(trimmed) ? trimmed.slice(1, -1) : null;
}

function childrenOf(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((child) => child.tag === tag);
}

function childOf(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((child) => child.tag === tag);
}

function childValue(node: GedcomNode, tag: string): string | null {
  const value = childOf(node, tag)?.value.trim();
  return value ? value : null;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface GedcomImportCitation {
  sourceRef: string;
  page: string | null;
  volume: string | null;
  entryId: string | null;
  certificateNumber: string | null;
  note: string | null;
  confidence: string;
  /** Ancestry's record pointer (`_APID`), kept for the round trip. */
  ancestryApid: string | null;
}

export interface GedcomImportName {
  nameType: string;
  given: string;
  surname: string;
  since: HistoricalDate | null;
  notes: string | null;
  citations: GedcomImportCitation[];
}

export interface GedcomImportEvent {
  eventType: string;
  label: string | null;
  date: HistoricalDate | null;
  place: string | null;
  details: Record<string, string> | null;
  notes: string | null;
  citations: GedcomImportCitation[];
}

/**
 * Someone named in a role (GEDCOM `ASSO`) — see `associationSchema`. The
 * associate is a person in the file (`associateRef`) or, for this app's own
 * name-only `_ASSO` and GEDCOM 7's `@VOID@` + PHRASE, just a name.
 */
export interface GedcomImportAssociation {
  associateRef: string | null;
  associateName: string | null;
  role: string;
  label: string | null;
  notes: string | null;
  citations: GedcomImportCitation[];
}

export interface GedcomImportPerson {
  /** The INDI record's xref — only meaningful within this one file. */
  ref: string;
  given: string;
  surname: string;
  gender: Gender;
  titlePrefix: string | null;
  suffix: string | null;
  isLiving: boolean;
  notes: string | null;
  /** Evidence for the person as a whole (`factType: "person"`). */
  citations: GedcomImportCitation[];
  names: GedcomImportName[];
  events: GedcomImportEvent[];
  restriction: PersonRestriction | null;
  /** Roles with no event of their own (`1 ASSO` directly under INDI). */
  associations: GedcomImportAssociation[];
  /** Roles tied to one of `events`, by its index there. */
  eventAssociations: (GedcomImportAssociation & { eventIndex: number })[];
  researchNotes: { noteType: string; body: string; resolved: boolean }[];
  /** FamilySearch/Ancestry ids, REFN and GEDCOM 7 EXID — see `personExternalIds`. */
  externalIds: { system: PersonExternalIdSystem; value: string; type: string | null }[];
}

export interface GedcomImportUnion {
  personARef: string;
  personBRef: string;
  status: string;
  startDate: HistoricalDate | null;
  startPlace: string | null;
  endDate: HistoricalDate | null;
  endPlace: string | null;
  notes: string | null;
  citations: GedcomImportCitation[];
  /** Marriage witnesses and the like — owned by `personARef`, tied to this union. */
  associations: GedcomImportAssociation[];
}

export interface GedcomImportSource {
  ref: string;
  title: string;
  author: string | null;
  publication: string | null;
  /** A `GedcomImportRepository.ref`. */
  repositoryRef: string | null;
  /** REPO.CALN — the source's shelf mark in that repository. */
  callNumber: string | null;
  sourceType: string | null;
}

/** A REPO record, or a repository a source only names inline (deduplicated by name). */
export interface GedcomImportRepository {
  ref: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

/**
 * Every warning is a code plus a count — translated in the frontend, not
 * worded here — and a few concrete examples so the user can find the
 * offending part of their file.
 */
export type GedcomImportWarningCode =
  | "malformedLine"
  | "legacyEncoding"
  | "unparsedDate"
  | "missingReference"
  | "extraVitalEvent"
  | "inlineSource"
  | "sourceTextDropped"
  | "familyDataDropped"
  | "inferredDeceased"
  | "extraFamilyEvent"
  | "challengedParentLink"
  | "disprovenParentLink"
  | "invalidCoordinates"
  | "conflictingCoordinates"
  | "skippedTag";

export interface GedcomImportWarning {
  code: GedcomImportWarningCode;
  count: number;
  examples: string[];
}

export interface GedcomImportPlan {
  header: { sourceSystem: string | null; version: string | null; charset: string | null };
  persons: GedcomImportPerson[];
  unions: GedcomImportUnion[];
  parentLinks: { parentRef: string; childRef: string; parentage: string }[];
  /** Every couple named by a FAM record — with or without a `unions` row (see `GedcomImportUnion`). */
  spouseLinks: { aRef: string; bRef: string }[];
  sources: GedcomImportSource[];
  repositories: GedcomImportRepository[];
  /** Coordinates from `PLAC.MAP`, one per distinct place text (the first wins on a conflict). */
  places: { name: string; latitude: number; longitude: number }[];
  warnings: GedcomImportWarning[];
  /**
   * Event types the file uses that no `event_type` option matched, so they
   * import as "other" with a label — most-used first. Shown in the preview
   * so the user can add the option in Settings and re-check before
   * importing. `suggestedKey` is the key the importer would match (for a
   * GEDCOM tag) or a slug of the `TYPE` text (for `EVEN`, which also
   * matches on label); `null` when there's nothing to match on.
   */
  unmappedEventTypes: { label: string; tag: string; suggestedKey: string | null; count: number }[];
}

export interface GedcomImportCounts {
  persons: number;
  names: number;
  events: number;
  unions: number;
  parentLinks: number;
  spouseLinks: number;
  sources: number;
  citations: number;
  associations: number;
  researchNotes: number;
  places: number;
  repositories: number;
  externalIds: number;
}

export function countGedcomImportPlan(plan: GedcomImportPlan): GedcomImportCounts {
  let names = 0;
  let events = 0;
  let citations = 0;
  for (const person of plan.persons) {
    names += person.names.length;
    events += person.events.length;
    citations += person.citations.length;
    for (const name of person.names) citations += name.citations.length;
    for (const event of person.events) citations += event.citations.length;
  }
  let associations = 0;
  let researchNotes = 0;
  for (const person of plan.persons) {
    researchNotes += person.researchNotes.length;
    for (const association of [...person.associations, ...person.eventAssociations]) {
      associations += 1;
      citations += association.citations.length;
    }
  }
  for (const union of plan.unions) {
    citations += union.citations.length;
    for (const association of union.associations) {
      associations += 1;
      citations += association.citations.length;
    }
  }
  return {
    persons: plan.persons.length,
    names,
    events,
    unions: plan.unions.length,
    parentLinks: plan.parentLinks.length,
    spouseLinks: plan.spouseLinks.length,
    sources: plan.sources.length,
    citations,
    associations,
    researchNotes,
    places: plan.places.length,
    repositories: plan.repositories.length,
    externalIds: plan.persons.reduce((total, person) => total + person.externalIds.length, 0),
  };
}

/** The live option keys/labels per configurable topic — mapping only ever produces a key that exists in the target database. */
export type GedcomImportVocabulary = Partial<
  Record<ConfigurableTopic, readonly { key: string; label: string }[]>
>;

export interface GedcomImportOptions {
  vocabulary: GedcomImportVocabulary;
  /** What `decodeGedcomBytes` had to fall back to, if it was reported. */
  encoding?: GedcomEncoding;
  /** Injectable for tests — the "born over 110 years ago" deceased inference is relative to it. */
  today?: Date;
}

/** Thrown for input that isn't a GEDCOM file at all, as opposed to a GEDCOM file with problems (those become warnings). */
export class GedcomImportError extends Error {
  override readonly name = "GedcomImportError";
}

// ---------------------------------------------------------------------------
// Mapping tables
// ---------------------------------------------------------------------------

interface EventTagMapping {
  /** Option keys to try, in order, against the live `event_type` vocabulary. */
  keys: string[];
  /** Used as the label when no key matches and the event falls back to "other". */
  label: string;
  /** For attribute-style tags (`1 OCCU Farmer`), which `details` key holds the line's value. */
  valueDetail?: string;
}

/**
 * Every individual event/attribute tag GEDCOM 5.5.1 defines. Keys that
 * aren't seeded (`confirmation`, `census`, ...) still map if the user has
 * added a matching option in Settings; otherwise they land as "other" with
 * the English tag name as their label — never dropped.
 */
const INDIVIDUAL_EVENT_TAGS: Record<string, EventTagMapping> = {
  BIRT: { keys: ["birth"], label: "Birth" },
  DEAT: { keys: ["death"], label: "Death" },
  BURI: { keys: ["burial"], label: "Burial" },
  CREM: { keys: ["cremation"], label: "Cremation" },
  CHR: { keys: ["christening", "baptism"], label: "Christening" },
  BAPM: { keys: ["baptism", "christening"], label: "Baptism" },
  CHRA: { keys: ["adult_christening"], label: "Adult christening" },
  BLES: { keys: ["blessing"], label: "Blessing" },
  CONF: { keys: ["confirmation"], label: "Confirmation" },
  FCOM: { keys: ["first_communion"], label: "First communion" },
  BARM: { keys: ["bar_mitzvah"], label: "Bar mitzvah" },
  BASM: { keys: ["bat_mitzvah"], label: "Bat mitzvah" },
  ORDN: { keys: ["ordination"], label: "Ordination" },
  ADOP: { keys: ["adoption"], label: "Adoption" },
  IMMI: { keys: ["immigration"], label: "Immigration" },
  EMIG: { keys: ["emigration"], label: "Emigration" },
  NATU: { keys: ["naturalization"], label: "Naturalization" },
  RESI: { keys: ["residence"], label: "Residence" },
  CENS: { keys: ["census"], label: "Census" },
  GRAD: { keys: ["graduation"], label: "Graduation" },
  RETI: { keys: ["retirement"], label: "Retirement" },
  PROB: { keys: ["probate"], label: "Probate" },
  WILL: { keys: ["will"], label: "Will" },
  OCCU: { keys: ["occupation"], label: "Occupation", valueDetail: "jobTitle" },
  EDUC: { keys: ["education"], label: "Education" },
  RELI: { keys: ["religion"], label: "Religion" },
  TITL: { keys: ["nobility_title", "title"], label: "Title" },
  PROP: { keys: ["property"], label: "Property" },
  DSCR: { keys: ["physical_description"], label: "Physical description" },
  NATI: { keys: ["nationality"], label: "Nationality" },
  CAST: { keys: ["caste"], label: "Caste" },
  NCHI: { keys: ["children_count"], label: "Number of children" },
  NMR: { keys: ["marriage_count"], label: "Number of marriages" },
  IDNO: { keys: ["id_number"], label: "Identification number" },
  SSN: { keys: ["social_security_number"], label: "Social security number" },
};

/**
 * The exporter's side of `INDIVIDUAL_EVENT_TAGS`: which tag an `event_type`
 * key is written as. Only a tag's *first* (preferred) key counts —
 * `christening` → `CHR`, `baptism` → `BAPM` — so export → import lands back
 * on the same key. `null` for "other" and any user-added type with no
 * GEDCOM tag; those go out as `EVEN` + `TYPE`.
 */
export function gedcomEventTag(
  eventType: string,
): { tag: string; valueDetail: string | null } | null {
  for (const [tag, mapping] of Object.entries(INDIVIDUAL_EVENT_TAGS)) {
    if (mapping.keys[0] === eventType) return { tag, valueDetail: mapping.valueDetail ?? null };
  }
  return null;
}

/**
 * `details` keys (see `eventDetailFields` in the frontend) that have a
 * standard GEDCOM event sub-tag, per event type. Every other detail key is
 * written as this app's own `2 _DETAIL <value>` / `3 TYPE <key>` — other
 * programs ignore an underscore tag, this importer reads it back.
 */
export const GEDCOM_EVENT_DETAIL_TAGS: Record<string, Record<string, string>> = {
  occupation: { employer: "AGNC" },
  death: { causeOfDeath: "CAUS" },
  residence: { address: "ADDR" },
};

/** The only values GEDCOM 5.5.1 allows for `FAMC.PEDI`; any other parentage travels as `_FREL`/`_MREL`. */
export const GEDCOM_PEDIGREE_VALUES: ReadonlySet<string> = new Set([
  "birth",
  "adopted",
  "foster",
  "sealed",
]);

/** A `name_variant_type` key as a GEDCOM `NAME.TYPE` — 5.5.1's own word where one exists, otherwise the key itself (5.5.1 allows user-defined types). */
export function gedcomNameType(nameType: string): string {
  return (
    ({ birth: "birth", married: "married", nickname: "aka" } as Record<string, string>)[nameType] ??
    nameType
  );
}

/**
 * A `name_variant_type` key as GEDCOM 7's NAME.TYPE: one of its fixed codes
 * where one fits, otherwise `OTHER` with the option's label as the PHRASE
 * (7 dropped 5.5.1's user-defined types).
 */
export function gedcom7NameType(
  nameType: string,
  label: string,
): { type: string; phrase: string | null } {
  const code = ({ birth: "BIRTH", married: "MARRIED", nickname: "AKA" } as Record<string, string>)[
    nameType
  ];
  return code ? { type: code, phrase: null } : { type: "OTHER", phrase: label };
}

/** An `association_role` key as GEDCOM 7's ASSO.ROLE code, or `OTHER` with a PHRASE. */
export function gedcom7Role(role: string, label: string): { role: string; phrase: string | null } {
  const code = (
    { godparent: "GODP", witness: "WITN", officiant: "OFFICIATOR" } as Record<string, string>
  )[role];
  return code ? { role: code, phrase: null } : { role: "OTHER", phrase: label };
}

/** The seeded `confidence` keys as `QUAY` 0–3; `null` for a user-added level, which has no QUAY equivalent. */
export function gedcomQuay(confidence: string): string | null {
  return (
    ({ low: "0", medium: "1", high: "2", proven: "3" } as Record<string, string>)[confidence] ??
    null
  );
}

/** Event tags whose mere presence means the person is no longer living. */
const DECEASED_TAGS = new Set(["DEAT", "BURI", "CREM", "PROB"]);

/** Nobody in a family tree is plausibly alive this long after their birth or christening. */
const MAX_PLAUSIBLE_AGE = 110;

const MARRIAGE_START_TAGS = ["MARR", "MARB", "MARC", "MARL", "MARS"];
const ENGAGEMENT_TAGS = ["ENGA"];
// `_END` is this app's own: how a union ended when it was neither a divorce
// nor an annulment (a spouse's death, a separation) — 5.5.1 has no tag for it.
const UNION_END_TAGS = ["DIV", "DIVF", "ANUL", "_END"];
const FAMILY_EVENT_TAGS = [...MARRIAGE_START_TAGS, ...ENGAGEMENT_TAGS, ...UNION_END_TAGS];

/** GEDCOM `NAME.TYPE` values (5.5.1's suggested set, plus what other exporters write) → `name_variant_type` keys. */
const NAME_TYPE_KEYS: Record<string, string[]> = {
  birth: ["birth"],
  maiden: ["birth"],
  married: ["married"],
  aka: ["nickname", "alternate_spelling"],
  nickname: ["nickname"],
  immigrant: ["other"],
};

/** `PEDI`/`_FREL`/`_MREL` values → `parentage` keys. */
const PARENTAGE_KEYS: Record<string, string[]> = {
  birth: ["birth"],
  natural: ["birth"],
  biological: ["birth"],
  adopted: ["adopted"],
  foster: ["foster"],
  step: ["step"],
  stepchild: ["step"],
};

/** `QUAY` 0–3 (unreliable → primary evidence) → `confidence` keys. */
const QUAY_KEYS: Record<string, string[]> = {
  "0": ["low"],
  "1": ["medium"],
  "2": ["high"],
  "3": ["proven", "high"],
};

// Tags that carry no genealogical content worth importing (change stamps,
// record ids, submitter links) — skipped without a warning, unlike an
// unrecognized tag that might be someone's real data.
const SILENTLY_IGNORED_TAGS = new Set(["CHAN", "RIN", "UID", "_UID", "AFN", "RFN", "SUBM", "_UPD"]);

const NOTHING_HANDLED: ReadonlySet<string> = new Set();

/** 5.5.1's structured address lines, read when an ADDR's own value is empty. */
const ADDRESS_PARTS = ["ADR1", "ADR2", "ADR3", "CITY", "STAE", "POST", "CTRY"];

/** English names for family events that end up in a union's notes rather than its start/end fields. */
const FAMILY_EVENT_LABELS: Record<string, string> = {
  MARR: "Marriage",
  MARB: "Marriage banns",
  MARC: "Marriage contract",
  MARL: "Marriage license",
  MARS: "Marriage settlement",
  ENGA: "Engagement",
  DIV: "Divorce",
  DIVF: "Divorce filed",
  ANUL: "Annulment",
  _END: "Union ended",
};

/**
 * Role words other programs write in `ASSO.RELA` (5.5.1, free text) or
 * `ASSO.ROLE` (GEDCOM 7's codes) → `association_role` keys, Danish words
 * included since that's what this tree's records say. Tried after an exact
 * match on an option's key or label.
 */
const ROLE_KEYS: Record<string, string[]> = {
  godparent: ["godparent"],
  godfather: ["godparent"],
  godmother: ["godparent"],
  godp: ["godparent"],
  sponsor: ["godparent"],
  fadder: ["godparent"],
  gudfar: ["godparent"],
  gudmor: ["godparent"],
  witness: ["witness"],
  witn: ["witness"],
  vidne: ["witness"],
  forlover: ["witness"],
  informant: ["informant"],
  anmelder: ["informant"],
  officiant: ["officiant"],
  officiator: ["officiant"],
  clergy: ["officiant"],
  priest: ["officiant"],
  præst: ["officiant"],
};

/** RESN values, most restrictive first — a GEDCOM 7 file can list several ("CONFIDENTIAL, LOCKED"); the field holds one. */
const RESTRICTION_PRIORITY: PersonRestriction[] = ["confidential", "privacy", "locked"];

/** Tags a `_TODO` (Legacy, RootsMagic and this app's own exporter) may carry. */
const TODO_HANDLED = new Set([
  "_MARKDOWN",
  "DESC",
  "TEXT",
  "NOTE",
  "DATE",
  "TYPE",
  "_CAT",
  "_CATEGORY",
  "_PRIORITY",
  "_PRI",
  "_LOCL",
  "PLAC",
  "_REPO",
  "REPO",
  "STAT",
  "_STAT",
  "_STATUS",
  "_CDATE",
  "_COMPLETED",
  "_DONE",
]);

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

class WarningCollector {
  private readonly byCode = new Map<GedcomImportWarningCode, GedcomImportWarning>();
  private readonly skippedTags = new Map<string, number>();

  add(code: GedcomImportWarningCode, example?: string): void {
    const warning = this.byCode.get(code) ?? { code, count: 0, examples: [] };
    warning.count += 1;
    if (
      example !== undefined &&
      warning.examples.length < 5 &&
      !warning.examples.includes(example)
    ) {
      warning.examples.push(example);
    }
    this.byCode.set(code, warning);
  }

  /**
   * Records every child tag `node` has that the caller didn't handle, as
   * `PARENT.CHILD` (`PLAC.MAP`, `INDI.OBJE`) so the preview says where it
   * was. Every structure the importer reads calls this — including nested
   * ones (PLAC, ADDR, a citation's DATA, FAMC, CHIL, REPO) — so nothing is
   * dropped without showing up here.
   */
  skipUnhandled(node: GedcomNode, handled: ReadonlySet<string> = NOTHING_HANDLED): void {
    for (const child of node.children) {
      if (handled.has(child.tag) || SILENTLY_IGNORED_TAGS.has(child.tag)) continue;
      const path = `${node.tag}.${child.tag}`;
      this.skippedTags.set(path, (this.skippedTags.get(path) ?? 0) + 1);
    }
  }

  skipRecord(tag: string): void {
    this.skippedTags.set(tag, (this.skippedTags.get(tag) ?? 0) + 1);
  }

  toArray(): GedcomImportWarning[] {
    const warnings = [...this.byCode.values()];
    if (this.skippedTags.size > 0) {
      const sorted = [...this.skippedTags.entries()].toSorted(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      );
      warnings.push({
        code: "skippedTag",
        count: sorted.reduce((sum, [, count]) => sum + count, 0),
        examples: sorted.slice(0, 12).map(([tag, count]) => `${tag} (${count})`),
      });
    }
    return warnings;
  }
}

/**
 * Turns parsed GEDCOM into an import plan. Every configurable-option value it
 * produces (event type, name type, parentage, union status, confidence) is a
 * key that exists in `options.vocabulary` — or, where nothing matches, that
 * topic's catch-all ("other" for events), never an invented key.
 */
export function buildGedcomImportPlan(
  parsed: ParsedGedcom,
  options: GedcomImportOptions,
): GedcomImportPlan {
  const head = parsed.records[0];
  if (!head || head.tag !== "HEAD") {
    throw new GedcomImportError("Not a GEDCOM file — it doesn't start with a HEAD record");
  }

  const warnings = new WarningCollector();
  for (const line of parsed.malformedLines) warnings.add("malformedLine", `line ${line}`);

  const charset = childValue(head, "CHAR");
  if (options.encoding === "windows-1252") warnings.add("legacyEncoding", charset ?? undefined);

  const vocab = new Vocabulary(options.vocabulary);
  const today = options.today ?? new Date();

  const indiRecords = new Map<string, GedcomNode>();
  const famRecords: GedcomNode[] = [];
  const sourRecords: GedcomNode[] = [];
  const noteRecords = new Map<string, GedcomNode>();
  const repoRecords = new Map<string, GedcomNode>();
  const todoRecords = new Map<string, GedcomNode>();
  let anonymousCount = 0;
  for (const record of parsed.records.slice(1)) {
    switch (record.tag) {
      case "INDI":
        indiRecords.set(record.xref ?? `__anonymous_${++anonymousCount}`, record);
        break;
      case "FAM":
        famRecords.push(record);
        break;
      case "SOUR":
        sourRecords.push(record);
        break;
      case "NOTE":
        if (record.xref) noteRecords.set(record.xref, record);
        break;
      case "REPO":
        if (record.xref) repoRecords.set(record.xref, record);
        break;
      case "_TODO":
        if (record.xref) todoRecords.set(record.xref, record);
        break;
      case "TRLR":
      case "SUBM":
      case "SUBN":
        break;
      default:
        warnings.skipRecord(record.tag);
    }
  }

  for (const record of noteRecords.values()) warnings.skipUnhandled(record);

  /** An ADDR's text: its own value (with CONT lines), or else its structured ADR1…CTRY lines. */
  const readAddress = (node: GedcomNode | undefined): string | null => {
    if (!node) return null;
    warnings.skipUnhandled(node, new Set(ADDRESS_PARTS));
    const own = singleLine(node.value, ", ");
    if (own) return own;
    return (
      ADDRESS_PARTS.map((tag) => childValue(node, tag))
        .filter((part): part is string => !!part)
        .map((part) => singleLine(part, ", "))
        .join(", ") || null
    );
  };
  /**
   * A PLAC's text, collecting its MAP coordinates into `placeCoordinates`
   * on the way (coordinates belong to the place, so they're keyed by its
   * text, not by the event). FORM, FONE/ROMN etc. are still reported.
   */
  const placeCoordinates = new Map<string, { latitude: number; longitude: number }>();
  const readPlace = (node: GedcomNode): string | null => {
    const place = childOf(node, "PLAC");
    if (!place) return null;
    warnings.skipUnhandled(place, new Set(["MAP"]));
    const name = nullableSingleLine(place.value.trim() || null);
    const map = childOf(place, "MAP");
    if (map) {
      warnings.skipUnhandled(map, new Set(["LATI", "LONG"]));
      const latitude = parseCoordinate(childValue(map, "LATI"), "N", "S", 90);
      const longitude = parseCoordinate(childValue(map, "LONG"), "E", "W", 180);
      if (latitude === null || longitude === null) {
        warnings.add("invalidCoordinates", name ?? undefined);
      } else if (name) {
        const existing = placeCoordinates.get(name);
        if (!existing) {
          placeCoordinates.set(name, { latitude, longitude });
        } else if (
          Math.abs(existing.latitude - latitude) > 1e-6 ||
          Math.abs(existing.longitude - longitude) > 1e-6
        ) {
          warnings.add("conflictingCoordinates", name);
        }
      }
    }
    return name;
  };

  /**
   * A note's text. This app's exporter writes notes as plain text for other
   * programs, with the original markdown in a `_MARKDOWN` child whenever the
   * two differ — so prefer that, and an export → import round trip keeps the
   * formatting.
   */
  const resolveNote = (node: GedcomNode): string | null => {
    const markdown = childValue(node, "_MARKDOWN");
    if (markdown?.trim()) return markdown.trim();
    const pointer = pointerOf(node.value);
    if (!pointer) return node.value.trim() || null;
    const record = noteRecords.get(pointer);
    if (!record) {
      warnings.add("missingReference", `@${pointer}@`);
      return null;
    }
    return childValue(record, "_MARKDOWN")?.trim() || record.value.trim() || null;
  };
  const notesOf = (node: GedcomNode, extra: (string | null)[] = []): string | null =>
    joinNotes([...extra, ...childrenOf(node, "NOTE").map(resolveNote)]);

  // Repositories — REPO records, plus any a source only names inline.
  // FAX, NOTE and the like have no column and are still reported.
  const repositories: GedcomImportRepository[] = [];
  const repoHandled = new Set(["NAME", "ADDR", "PHON", "EMAIL", "_EMAIL", "WWW", "_WWW"]);
  for (const [ref, record] of repoRecords) {
    warnings.skipUnhandled(record, repoHandled);
    repositories.push({
      ref,
      name: singleLine(childValue(record, "NAME") ?? `Repository ${ref}`),
      address: readAddress(childOf(record, "ADDR")),
      phone: nullableSingleLine(childValue(record, "PHON")),
      email: nullableSingleLine(childValue(record, "EMAIL") ?? childValue(record, "_EMAIL")),
      website: nullableSingleLine(childValue(record, "WWW") ?? childValue(record, "_WWW")),
    });
  }
  const inlineRepositories = new Map<string, string>();
  const inlineRepositoryRef = (name: string): string => {
    const existing = inlineRepositories.get(name);
    if (existing) return existing;
    const ref = `__inline_repo_${inlineRepositories.size + 1}`;
    inlineRepositories.set(name, ref);
    repositories.push({ ref, name, address: null, phone: null, email: null, website: null });
    return ref;
  };

  // Sources first — citations anywhere below need to know which refs exist.
  const sources: GedcomImportSource[] = [];
  const sourceRefs = new Set<string>();
  const sourceHandled = new Set([
    "TITL",
    "ABBR",
    "AUTH",
    "PUBL",
    "REPO",
    "NOTE",
    "TEXT",
    "DATA",
    "_TYPE",
  ]);
  for (const record of sourRecords) {
    if (!record.xref) continue;
    const repoNode = childOf(record, "REPO");
    let repositoryRef: string | null = null;
    let callNumber: string | null = null;
    let sourceType: string | null = null;
    if (repoNode) {
      const repoPointer = pointerOf(repoNode.value);
      if (repoPointer) {
        if (repoRecords.has(repoPointer)) repositoryRef = repoPointer;
        else warnings.add("missingReference", `@${repoPointer}@`);
      } else {
        const inlineName = singleLine(repoNode.value.trim());
        if (inlineName) repositoryRef = inlineRepositoryRef(inlineName);
      }
      warnings.skipUnhandled(repoNode, new Set(["CALN"]));
      const caln = childOf(repoNode, "CALN");
      if (caln) {
        warnings.skipUnhandled(caln, new Set(["MEDI"]));
        callNumber = nullableSingleLine(caln.value.trim() || null);
        sourceType = childValue(caln, "MEDI");
      }
    }
    // `sources` has no notes column, and a source's transcribed TEXT doesn't
    // belong in any of the columns it does have.
    if (childOf(record, "NOTE") || childOf(record, "TEXT") || childOf(record, "DATA")) {
      warnings.add("sourceTextDropped", `@${record.xref}@`);
    }
    warnings.skipUnhandled(record, sourceHandled);
    sources.push({
      ref: record.xref,
      title: singleLine(
        childValue(record, "TITL") ?? childValue(record, "ABBR") ?? `Source ${record.xref}`,
      ),
      author: nullableSingleLine(childValue(record, "AUTH")),
      publication: nullableSingleLine(childValue(record, "PUBL")),
      repositoryRef,
      callNumber,
      // `_TYPE` is this app's own exporter; REPO.CALN.MEDI what others write.
      sourceType: nullableSingleLine(childValue(record, "_TYPE") ?? sourceType),
    });
    sourceRefs.add(record.xref);
  }

  // A citation with no pointer (`1 SOUR Parish register, Brande`) describes
  // its source inline — it becomes a source of its own, deduplicated by text.
  const inlineSources = new Map<string, string>();
  const citationHandled = new Set([
    "PAGE",
    "QUAY",
    "DATA",
    "NOTE",
    "TEXT",
    "_VOLUME",
    "_ENTRY",
    "_CERT",
    "_APID",
  ]);
  const mapCitations = (node: GedcomNode): GedcomImportCitation[] =>
    childrenOf(node, "SOUR").flatMap((sour) => {
      let sourceRef = pointerOf(sour.value);
      if (sourceRef && !sourceRefs.has(sourceRef)) {
        warnings.add("missingReference", `@${sourceRef}@`);
        return [];
      }
      if (!sourceRef) {
        const title = singleLine(sour.value.trim());
        if (!title) return [];
        sourceRef = inlineSources.get(title) ?? null;
        if (!sourceRef) {
          sourceRef = `__inline_${inlineSources.size + 1}`;
          inlineSources.set(title, sourceRef);
          sources.push({
            ref: sourceRef,
            title: title.slice(0, 500),
            author: null,
            publication: null,
            repositoryRef: null,
            callNumber: null,
            sourceType: null,
          });
          warnings.add("inlineSource", title.slice(0, 80));
        }
      }
      warnings.skipUnhandled(sour, citationHandled);
      const data = childOf(sour, "DATA");
      if (data) warnings.skipUnhandled(data, new Set(["TEXT", "DATE"]));
      // DATA.DATE is when the record was made (a register entry's date) — no
      // citation column for it, but it belongs with the citation's text.
      const recorded = data ? childValue(data, "DATE") : null;
      let note = joinNotes([
        recorded ? `Recorded: ${recorded}` : null,
        ...(data ? childrenOf(data, "TEXT").map((text) => text.value.trim()) : []),
        ...childrenOf(sour, "TEXT").map((text) => text.value.trim()),
        ...childrenOf(sour, "NOTE").map(resolveNote),
      ]);
      // This app's own exporter folds confidence into the citation text as a
      // trailing "— confidence: <key>" (GEDCOM's QUAY is only 0–3) — read it
      // back so an export → import round trip keeps it.
      let confidence: string | null = null;
      const quay = childValue(sour, "QUAY");
      if (quay) confidence = vocab.match("confidence", QUAY_KEYS[quay] ?? []);
      const roundTrip = note ? /^(.*?)(?:\s—\s)?confidence: ([a-z][a-z0-9_]*)$/s.exec(note) : null;
      if (roundTrip && vocab.has("confidence", roundTrip[2] ?? "")) {
        confidence = roundTrip[2] ?? null;
        note = roundTrip[1]?.trim() || null;
      }
      return [
        {
          sourceRef,
          page: nullableSingleLine(childValue(sour, "PAGE")),
          // This app's own citation fields, which GEDCOM folds into PAGE.
          volume: nullableSingleLine(childValue(sour, "_VOLUME")),
          entryId: nullableSingleLine(childValue(sour, "_ENTRY")),
          certificateNumber: nullableSingleLine(childValue(sour, "_CERT")),
          note,
          confidence: confidence ?? vocab.match("confidence", ["medium"]) ?? "medium",
          ancestryApid: nullableSingleLine(childValue(sour, "_APID")),
        },
      ];
    });

  const parseDate = (node: GedcomNode, tag = "DATE"): HistoricalDate | null => {
    // GEDCOM 7 puts the wording as written in a PHRASE under the DATE — the
    // only home for a double year or free text there. Prefer it whenever it
    // reads as a date (or there's no DATE value at all); otherwise the DATE
    // value is the better source of bounds.
    const dateNode = childOf(node, tag);
    const phrase = dateNode ? childValue(dateNode, "PHRASE") : null;
    const value = childValue(node, tag);
    const raw =
      phrase && (!value || parseHistoricalDateDetailed(phrase).kind !== "unparsed")
        ? phrase
        : value;
    if (!raw) return null;
    // The Gregorian escape is GEDCOM's default calendar spelled out — safe to
    // drop. A Julian escape stays in the wording and is parsed (bounds are
    // converted to Gregorian); Hebrew and French Republican stay unparsed.
    const original = raw.replace(/^@#DGREGORIAN@\s*/i, "");
    if (!original) return null;
    if (parseHistoricalDateDetailed(original).kind === "unparsed") {
      warnings.add("unparsedDate", original);
    }
    return { original, ...parseHistoricalDate(original) };
  };

  // INDI.FAMC.PEDI is where 5.5.1 records parentage, and FAMC.STAT how sure
  // the link is (challenged/disproven/proven); both keyed child|family.
  const famcPedigree = new Map<string, string>();
  const famcStatus = new Map<string, string>();
  const personLabels = new Map<string, string>();

  /**
   * Every ASSO (pointer to a person in the file) and `_ASSO` (this app's
   * own name-only form) directly under `node`. GEDCOM 7's `ASSO @VOID@`
   * with a PHRASE is read as name-only too.
   */
  const assoHandled = new Set(["RELA", "ROLE", "NOTE", "SOUR", "PHRASE", "TYPE"]);
  const mapAssociations = (node: GedcomNode, ownerRef: string): GedcomImportAssociation[] =>
    // In file order, ASSO and _ASSO interleaved as written.
    node.children
      .filter((child) => child.tag === "ASSO" || child.tag === "_ASSO")
      .flatMap((asso) => {
        warnings.skipUnhandled(asso, assoHandled);
        let associateRef: string | null = null;
        let associateName: string | null = null;
        const pointer = pointerOf(asso.value);
        if (asso.tag === "_ASSO") {
          associateName = nullableSingleLine(asso.value.trim() || null);
        } else if (pointer === "VOID" || !pointer) {
          associateName = nullableSingleLine(
            childValue(asso, "PHRASE") ?? (asso.value.trim() || null),
          );
        } else if (!indiRecords.has(pointer)) {
          warnings.add("missingReference", `@${pointer}@`);
          return [];
        } else {
          associateRef = pointer;
        }
        if ((!associateRef && !associateName) || associateRef === ownerRef) return [];
        // GEDCOM 7: `ROLE OTHER` carries the actual role in a PHRASE.
        const roleNode = childOf(asso, "ROLE");
        const roleText =
          childValue(asso, "RELA") ??
          (roleNode?.value.trim().toUpperCase() === "OTHER"
            ? (childValue(roleNode, "PHRASE") ?? "other")
            : childValue(asso, "ROLE"));
        const role =
          (roleText ? vocab.matchText("association_role", roleText) : null) ??
          vocab.match("association_role", ROLE_KEYS[roleText?.toLowerCase() ?? ""] ?? []);
        return [
          {
            associateRef,
            associateName,
            role: role ?? vocab.match("association_role", ["other"]) ?? "other",
            // An unmatched role keeps its own wording as the "other" label.
            label: role ? null : (nullableSingleLine(roleText) ?? "Associate"),
            notes: notesOf(asso),
            citations: mapCitations(asso),
          },
        ];
      });

  /** A `_TODO` (inline, or a pointer to a `0 @T1@ _TODO` record) as a research note. */
  const mapTodo = (
    node: GedcomNode,
  ): GedcomImportPlan["persons"][number]["researchNotes"][number] | null => {
    const pointer = pointerOf(node.value);
    const todo = pointer ? todoRecords.get(pointer) : node;
    if (!todo) {
      warnings.add("missingReference", `@${pointer}@`);
      return null;
    }
    warnings.skipUnhandled(todo, TODO_HANDLED);
    const typeText = childValue(todo, "TYPE");
    // This app's exporter writes the note type as TYPE; for other programs
    // TYPE is a free category, kept as a line in the body instead.
    const noteType = typeText ? vocab.matchText("research_note_type", typeText) : null;
    const statusText =
      childValue(todo, "STAT") ?? childValue(todo, "_STAT") ?? childValue(todo, "_STATUS");
    const completed =
      childValue(todo, "_CDATE") ?? childValue(todo, "_COMPLETED") ?? childValue(todo, "_DONE");
    const description = joinNotes([
      // See `resolveNote` for `_MARKDOWN`.
      childValue(todo, "_MARKDOWN")?.trim() || (pointer ? null : todo.value.trim() || null),
      childValue(todo, "DESC"),
      ...childrenOf(todo, "TEXT").map((text) => text.value.trim()),
      ...childrenOf(todo, "NOTE").map(resolveNote),
    ]);
    const metadata = [
      ["Date", childValue(todo, "DATE")],
      ["Category", noteType ? null : typeText],
      ["Category", childValue(todo, "_CAT") ?? childValue(todo, "_CATEGORY")],
      ["Priority", childValue(todo, "_PRIORITY") ?? childValue(todo, "_PRI")],
      ["Place", childValue(todo, "_LOCL") ?? childValue(todo, "PLAC")],
      ["Repository", childValue(todo, "_REPO") ?? childValue(todo, "REPO")],
      ["Status", statusText],
      ["Completed", completed && !/^y(es)?$/i.test(completed) ? completed : null],
    ]
      .filter((entry): entry is [string, string] => !!entry[1])
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    return {
      noteType:
        noteType ??
        vocab.match("research_note_type", ["open_question"]) ??
        vocab.first("research_note_type") ??
        "open_question",
      body: joinNotes([description, metadata || null]) ?? "(no description)",
      resolved:
        !!completed || /^(done|completed?|closed|finished|resolved|y|yes)$/i.test(statusText ?? ""),
    };
  };

  /**
   * A person's ids elsewhere. FamilySearch writes `_FSFTID` in 5.5.1 and an
   * `EXID` whose TYPE names familysearch.org in GEDCOM 7 — both become one
   * "familysearch" id (the EXID's TYPE kept), so the person page can link it.
   */
  const readExternalIds = (record: GedcomNode): GedcomImportPerson["externalIds"] => {
    const ids: GedcomImportPerson["externalIds"] = [];
    const add = (system: PersonExternalIdSystem, value: string, type: string | null) => {
      const trimmed = singleLine(value.trim());
      if (!trimmed || ids.some((id) => id.system === system && id.value === trimmed)) return;
      ids.push({ system, value: trimmed, type });
    };
    for (const node of childrenOf(record, "_FSFTID")) add("familysearch", node.value, null);
    for (const node of childrenOf(record, "_APID")) add("ancestry", node.value, null);
    for (const node of childrenOf(record, "REFN")) {
      warnings.skipUnhandled(node, new Set(["TYPE"]));
      add("refn", node.value, childValue(node, "TYPE"));
    }
    // `_EXID` is this app's own 5.5.1 spelling of a generic EXID.
    for (const node of [...childrenOf(record, "EXID"), ...childrenOf(record, "_EXID")]) {
      warnings.skipUnhandled(node, new Set(["TYPE"]));
      const type = childValue(node, "TYPE");
      add(/familysearch/i.test(type ?? "") ? "familysearch" : "exid", node.value, type);
    }
    return ids;
  };

  const unmappedEventTypes = new Map<string, GedcomImportPlan["unmappedEventTypes"][number]>();
  const noteUnmapped = (label: string, tag: string, suggestedKey: string | null): void => {
    const groupKey = label.toLowerCase();
    const entry = unmappedEventTypes.get(groupKey) ?? { label, tag, suggestedKey, count: 0 };
    entry.count += 1;
    unmappedEventTypes.set(groupKey, entry);
  };

  const eventHandled = new Set([
    "TYPE",
    "DATE",
    "PLAC",
    "ADDR",
    "NOTE",
    "SOUR",
    "CAUS",
    "AGE",
    "AGNC",
    "_DETAIL",
    "ASSO",
    "_ASSO",
  ]);
  const mapEvent = (node: GedcomNode, mapping: EventTagMapping | null): GedcomImportEvent => {
    warnings.skipUnhandled(node, eventHandled);
    const typeText = childValue(node, "TYPE");
    const value = node.value.trim().toUpperCase() === "Y" ? "" : singleLine(node.value.trim());
    const details: Record<string, string> = {};
    const extraNotes: string[] = [];

    let eventType: string;
    let label: string | null = null;
    if (mapping) {
      // Keys first (what this importer suggests adding), then the English
      // label, so an option the user named "Confirmation" also matches CONF.
      const key =
        vocab.match("event_type", mapping.keys) ?? vocab.matchText("event_type", mapping.label);
      eventType = key ?? "other";
      if (!key) noteUnmapped(mapping.label, node.tag, mapping.keys[0] ?? null);
      if (!key)
        label = value && !mapping.valueDetail ? `${mapping.label}: ${value}` : mapping.label;
      if (value) {
        if (mapping.valueDetail) details[mapping.valueDetail] = value;
        else if (key) extraNotes.push(value);
      }
      if (typeText) extraNotes.push(`Type: ${typeText}`);
    } else {
      // EVEN/FACT: the event's own TYPE says what it is — this app's own
      // exporter writes the option key there, other programs a free label.
      const key = typeText ? vocab.matchText("event_type", typeText) : null;
      eventType = key ?? "other";
      if (!key && typeText) noteUnmapped(singleLine(typeText), node.tag, slugKey(typeText));
      if (!key) label = typeText ?? (value || "Event");
      if (value && (key || typeText)) extraNotes.push(value);
    }

    let place = readPlace(node);
    // ADDR/CAUS/AGNC land in `details` where this event type has a field for
    // them (residence address, cause of death, employer); otherwise an
    // address stands in for a missing place, and the rest go to notes.
    const detailTags = GEDCOM_EVENT_DETAIL_TAGS[eventType] ?? {};
    for (const [detailKey, tag] of Object.entries(detailTags)) {
      const detailValue =
        tag === "ADDR" ? readAddress(childOf(node, "ADDR")) : childValue(node, tag);
      if (detailValue) details[detailKey] = singleLine(detailValue, ", ");
    }
    const handledByDetails = new Set(Object.values(detailTags));
    const address = handledByDetails.has("ADDR") ? null : readAddress(childOf(node, "ADDR"));
    if (address) {
      if (!place) place = address;
      else extraNotes.push(`Address: ${address}`);
    }
    const cause = handledByDetails.has("CAUS") ? null : childValue(node, "CAUS");
    if (cause) extraNotes.push(`Cause: ${cause}`);
    const age = childValue(node, "AGE");
    if (age) extraNotes.push(`Age: ${age}`);
    const agency = handledByDetails.has("AGNC") ? null : childValue(node, "AGNC");
    if (agency) extraNotes.push(`Agency: ${agency}`);
    for (const detail of childrenOf(node, "_DETAIL")) {
      warnings.skipUnhandled(detail, new Set(["TYPE"]));
      const detailKey = childValue(detail, "TYPE");
      const detailValue = detail.value.trim();
      if (detailKey && detailValue) details[detailKey] = detailValue;
    }

    return {
      eventType,
      label,
      date: parseDate(node),
      place,
      details: Object.keys(details).length > 0 ? details : null,
      notes: notesOf(node, extraNotes),
      citations: mapCitations(node),
    };
  };

  const persons: GedcomImportPerson[] = [];
  const indiHandled = new Set([
    "NAME",
    "SEX",
    "NOTE",
    "SOUR",
    "FAMC",
    "FAMS",
    "EVEN",
    "FACT",
    "RESN",
    "ASSO",
    "_ASSO",
    "_TODO",
    "_FSFTID",
    "_APID",
    "REFN",
    "EXID",
    "_EXID",
    ...Object.keys(INDIVIDUAL_EVENT_TAGS),
  ]);
  const nameHandled = new Set([
    "GIVN",
    "SURN",
    "SPFX",
    "NPFX",
    "NSFX",
    "NICK",
    "TYPE",
    "NOTE",
    "SOUR",
    "_MARNM",
    "_DATE",
  ]);
  for (const [ref, record] of indiRecords) {
    warnings.skipUnhandled(record, indiHandled);
    for (const famc of childrenOf(record, "FAMC")) {
      const family = pointerOf(famc.value);
      warnings.skipUnhandled(famc, new Set(["PEDI", "STAT"]));
      const pedi = childValue(famc, "PEDI");
      if (family && pedi) famcPedigree.set(`${ref}|${family}`, pedi);
      const stat = childValue(famc, "STAT")?.toLowerCase();
      if (family && stat) famcStatus.set(`${ref}|${family}`, stat);
    }

    const nameNodes = childrenOf(record, "NAME");
    const primary = nameNodes[0] ? readName(nameNodes[0]) : null;
    personLabels.set(ref, primary ? formatName(primary) : `@${ref}@`);
    const names: GedcomImportName[] = [];
    const personCitations: GedcomImportCitation[] = [];
    nameNodes.forEach((node, index) => {
      warnings.skipUnhandled(node, nameHandled);
      const parts = readName(node);
      if (index === 0) {
        // The primary name *is* the person's `given`/`surname` — there is no
        // separate fact row to cite, so its evidence goes on the person.
        personCitations.push(...mapCitations(node));
      } else {
        // GEDCOM 7: an unlisted type is `TYPE OTHER` with the words in a PHRASE.
        const typeNode = childOf(node, "TYPE");
        const typeText =
          typeNode?.value.trim().toUpperCase() === "OTHER"
            ? (childValue(typeNode, "PHRASE") ?? "other")
            : childValue(node, "TYPE");
        const nameType =
          (typeText ? vocab.matchText("name_variant_type", typeText) : null) ??
          vocab.match("name_variant_type", [
            ...(NAME_TYPE_KEYS[typeText?.toLowerCase() ?? ""] ?? []),
            "other",
          ]) ??
          vocab.first("name_variant_type");
        if (nameType) {
          names.push({
            nameType,
            given: parts.given,
            surname: parts.surname,
            // 5.5.1's NAME has no DATE; `_DATE` is this app's own "since".
            since: parseDate(node, "_DATE"),
            notes: notesOf(node),
            citations: mapCitations(node),
          });
        }
      }
      // Ancestry/FTM's married-surname shorthand, and the plain nickname tag.
      const marriedSurname = childValue(node, "_MARNM");
      const married = vocab.match("name_variant_type", ["married"]);
      if (marriedSurname && married) {
        names.push({
          nameType: married,
          given: parts.given,
          surname: marriedSurname,
          since: null,
          notes: null,
          citations: [],
        });
      }
      const nickname = childValue(node, "NICK");
      const nicknameType = vocab.match("name_variant_type", ["nickname"]);
      if (nickname && nicknameType) {
        names.push({
          nameType: nicknameType,
          given: nickname,
          surname: "",
          since: null,
          notes: null,
          citations: [],
        });
      }
    });

    const events: GedcomImportEvent[] = [];
    const eventAssociations: GedcomImportPerson["eventAssociations"] = [];
    let hasBirth = false;
    let hasDeath = false;
    let deceased = false;
    let earliestLifeYear: number | null = null;
    for (const child of record.children) {
      const mapping = INDIVIDUAL_EVENT_TAGS[child.tag];
      if (!mapping && child.tag !== "EVEN" && child.tag !== "FACT") continue;
      if (DECEASED_TAGS.has(child.tag)) deceased = true;
      // A bare `1 DEAT` (or `1 DEAT Y`) only says "known to be dead" — this
      // app's own exporter writes exactly that for `isLiving: false` with no
      // death details, so it maps back onto the flag, not onto an empty event.
      if (child.tag === "DEAT" && child.children.length === 0) continue;
      const event = mapEvent(child, mapping ?? null);
      // Birth and death are at most one per person in this app (see
      // `PersonService.addEvent`); a second one — conflicting sources,
      // usually — is kept as an "other" event rather than dropped.
      if (event.eventType === "birth" || event.eventType === "death") {
        const isBirth = event.eventType === "birth";
        if (isBirth ? hasBirth : hasDeath) {
          warnings.add("extraVitalEvent", primary ? formatName(primary) : `@${ref}@`);
          event.eventType = "other";
          event.label = isBirth ? "Birth (alternative)" : "Death (alternative)";
        } else if (isBirth) {
          hasBirth = true;
        } else {
          hasDeath = true;
        }
      }
      if ((child.tag === "BIRT" || child.tag === "CHR" || child.tag === "BAPM") && event.date) {
        const year = Number(event.date.earliest?.slice(0, 4) ?? event.date.latest?.slice(0, 4));
        if (Number.isFinite(year) && (earliestLifeYear === null || year < earliestLifeYear)) {
          earliestLifeYear = year;
        }
      }
      for (const association of mapAssociations(child, ref)) {
        eventAssociations.push({ ...association, eventIndex: events.length });
      }
      events.push(event);
    }
    // GEDCOM has no "living" flag — no death record usually just means
    // nobody recorded one, which for an 18th-century ancestor isn't the same
    // as alive. `isLiving` matters for the planned living-person redaction,
    // so a person born too long ago to plausibly be alive is marked deceased.
    if (
      !deceased &&
      earliestLifeYear !== null &&
      today.getFullYear() - earliestLifeYear > MAX_PLAUSIBLE_AGE
    ) {
      deceased = true;
      warnings.add("inferredDeceased", primary ? formatName(primary) : `@${ref}@`);
    }

    const sex = childValue(record, "SEX")?.toUpperCase();
    const restrictionWords = new Set(
      childrenOf(record, "RESN").flatMap((resn) => resn.value.toLowerCase().split(/[\s,]+/)),
    );
    persons.push({
      ref,
      given: primary?.given ?? "",
      surname: primary?.surname ?? "",
      gender: sex === "M" || sex === "F" ? sex : "U",
      titlePrefix: primary?.prefix ?? null,
      suffix: primary?.suffix ?? null,
      isLiving: !deceased,
      notes: notesOf(record),
      citations: [...personCitations, ...mapCitations(record)],
      names,
      events,
      restriction: RESTRICTION_PRIORITY.find((value) => restrictionWords.has(value)) ?? null,
      associations: mapAssociations(record, ref),
      eventAssociations,
      researchNotes: childrenOf(record, "_TODO")
        .map(mapTodo)
        .filter((note): note is NonNullable<typeof note> => note !== null),
      externalIds: readExternalIds(record),
    });
  }

  const unions: GedcomImportUnion[] = [];
  const parentLinks: GedcomImportPlan["parentLinks"] = [];
  const parentLinkKeys = new Set<string>();
  const spouseLinks: GedcomImportPlan["spouseLinks"] = [];
  const spouseLinkKeys = new Set<string>();
  const famHandled = new Set([
    "HUSB",
    "WIFE",
    "CHIL",
    "NOTE",
    "SOUR",
    "_STAT",
    "ASSO",
    "_ASSO",
    ...FAMILY_EVENT_TAGS,
  ]);
  const resolvePerson = (node: GedcomNode | undefined): string | null => {
    if (!node) return null;
    const pointer = pointerOf(node.value);
    if (!pointer) return null;
    if (!indiRecords.has(pointer)) {
      warnings.add("missingReference", `@${pointer}@`);
      return null;
    }
    return pointer;
  };

  for (const record of famRecords) {
    warnings.skipUnhandled(record, famHandled);
    const husband = resolvePerson(childOf(record, "HUSB"));
    const wife = resolvePerson(childOf(record, "WIFE"));

    for (const chil of childrenOf(record, "CHIL")) {
      warnings.skipUnhandled(chil, new Set(["PEDI", "_FREL", "_MREL"]));
      const child = resolvePerson(chil);
      if (!child) continue;
      // A researcher's "this child does NOT belong to this family" — creating
      // the link anyway would assert the opposite of what the file says.
      const linkStatus = record.xref ? famcStatus.get(`${child}|${record.xref}`) : undefined;
      if (linkStatus === "disproven") {
        warnings.add("disprovenParentLink", personLabels.get(child));
        continue;
      }
      if (linkStatus === "challenged")
        warnings.add("challengedParentLink", personLabels.get(child));
      const shared =
        childValue(chil, "PEDI") ??
        (record.xref ? famcPedigree.get(`${child}|${record.xref}`) : undefined);
      const perParent: [string | null, string | null][] = [
        [husband, childValue(chil, "_FREL") ?? shared ?? null],
        [wife, childValue(chil, "_MREL") ?? shared ?? null],
      ];
      for (const [parent, pedigree] of perParent) {
        if (!parent || parent === child) continue;
        const key = `${parent}|${child}`;
        if (parentLinkKeys.has(key)) continue;
        parentLinkKeys.add(key);
        parentLinks.push({
          parentRef: parent,
          childRef: child,
          parentage: resolveParentage(vocab, pedigree),
        });
      }
    }

    const familyEvents = record.children.filter((child) => FAMILY_EVENT_TAGS.includes(child.tag));
    // `_STAT` is the union status as this app's exporter writes it (and as
    // a few other programs do) — more precise than inferring it from events.
    const statusText = childValue(record, "_STAT");
    const familyHasData =
      familyEvents.length > 0 ||
      !!statusText ||
      !!childOf(record, "ASSO") ||
      !!childOf(record, "_ASSO") ||
      !!childOf(record, "NOTE") ||
      !!childOf(record, "SOUR");
    if (!husband || !wife || husband === wife) {
      if (familyHasData)
        warnings.add("familyDataDropped", record.xref ? `@${record.xref}@` : undefined);
      continue;
    }
    // Two partners named in one FAM are a couple whether or not the file
    // says anything more — that's a `SPOUSE_OF` edge. A `unions` row (status,
    // dates, evidence) only when there's something to put in it.
    const pairKey = [husband, wife].toSorted().join("|");
    if (!spouseLinkKeys.has(pairKey)) {
      spouseLinkKeys.add(pairKey);
      spouseLinks.push({ aRef: husband, bRef: wife });
    }
    if (!familyHasData) continue;

    const start =
      familyEvents.find((event) => MARRIAGE_START_TAGS.includes(event.tag)) ??
      familyEvents.find((event) => ENGAGEMENT_TAGS.includes(event.tag));
    const end = familyEvents.find((event) => UNION_END_TAGS.includes(event.tag));
    const statusKeys =
      end?.tag === "ANUL"
        ? ["annulled"]
        : end?.tag === "_END"
          ? ["widowed", "married"]
          : end
            ? ["divorced"]
            : start && ENGAGEMENT_TAGS.includes(start.tag)
              ? ["engaged", "partnership"]
              : ["married"];
    for (const event of familyEvents) warnings.skipUnhandled(event, eventHandled);
    // A union has one start and one end; every other family event (an
    // engagement before the marriage, banns, a second MARR from another
    // source) is kept as a line in its notes, as is any TYPE/ADDR/AGE/… on
    // the start/end events themselves, rather than silently dropped.
    // Each event's ADDR is read once (reading reports its unhandled parts):
    // it stands in for a missing PLAC on the start/end event, and otherwise
    // goes into the notes line.
    const places = new Map(familyEvents.map((event) => [event, readPlace(event)]));
    const addresses = new Map(
      familyEvents.map((event) => [event, readAddress(childOf(event, "ADDR"))]),
    );
    const placeOf = (event: GedcomNode | undefined): string | null =>
      event ? (places.get(event) ?? addresses.get(event) ?? null) : null;
    const describe = (event: GedcomNode, isStartOrEnd: boolean): string | null => {
      const type = childValue(event, "TYPE");
      const address = addresses.get(event);
      const agency = childValue(event, "AGNC");
      const cause = childValue(event, "CAUS");
      const age = childValue(event, "AGE");
      const parts = [
        isStartOrEnd ? null : childValue(event, "DATE"),
        isStartOrEnd ? null : placeOf(event),
        type && `type: ${type}`,
        // Already the union's place when there was no PLAC.
        address && (!isStartOrEnd || places.get(event)) ? `address: ${address}` : null,
        agency && `agency: ${agency}`,
        cause && `cause: ${cause}`,
        age && `age: ${age}`,
      ].filter((part): part is string => !!part);
      return parts.length > 0
        ? `${FAMILY_EVENT_LABELS[event.tag] ?? event.tag}: ${parts.join(", ")}`
        : null;
    };
    const eventLines: (string | null)[] = [];
    for (const event of familyEvents) {
      const isStartOrEnd = event === start || event === end;
      if (!isStartOrEnd) {
        warnings.add("extraFamilyEvent", FAMILY_EVENT_LABELS[event.tag] ?? event.tag);
      }
      eventLines.push(describe(event, isStartOrEnd));
    }
    unions.push({
      personARef: husband,
      personBRef: wife,
      status:
        (statusText ? vocab.matchText("union_status", statusText) : null) ??
        vocab.match("union_status", statusKeys) ??
        vocab.match("union_status", ["married"]) ??
        vocab.first("union_status") ??
        "married",
      startDate: start ? parseDate(start) : null,
      startPlace: placeOf(start),
      endDate: end ? parseDate(end) : null,
      endPlace: placeOf(end),
      notes: joinNotes([
        eventLines.filter(Boolean).join("\n") || null,
        notesOf(record),
        ...familyEvents.map((event) => notesOf(event)),
      ]),
      citations: [record, ...familyEvents].flatMap(mapCitations),
      // Witnesses under the MARR (GEDCOM 7 style, and this app's exporter)
      // or directly under the FAM — both belong to the marriage.
      associations: [record, ...familyEvents].flatMap((node) => mapAssociations(node, husband)),
    });
  }

  return {
    header: {
      sourceSystem: childValue(head, "SOUR"),
      version: (() => {
        const gedc = childOf(head, "GEDC");
        return gedc ? childValue(gedc, "VERS") : null;
      })(),
      charset,
    },
    persons,
    unions,
    parentLinks,
    spouseLinks,
    sources,
    repositories,
    places: [...placeCoordinates].map(([name, { latitude, longitude }]) => ({
      name,
      latitude,
      longitude,
    })),
    warnings: warnings.toArray(),
    unmappedEventTypes: [...unmappedEventTypes.values()].toSorted((a, b) => b.count - a.count),
  };
}

/** Parse + plan in one call — what both the preview and the real import run. */
export function planGedcomImport(text: string, options: GedcomImportOptions): GedcomImportPlan {
  return buildGedcomImportPlan(parseGedcom(text), options);
}

class Vocabulary {
  constructor(private readonly vocabulary: GedcomImportVocabulary) {}

  has(topic: ConfigurableTopic, key: string): boolean {
    return (this.vocabulary[topic] ?? []).some((option) => option.key === key);
  }

  /** The first candidate that is an existing key, compared case-insensitively. */
  match(topic: ConfigurableTopic, candidates: readonly string[]): string | null {
    const options = this.vocabulary[topic] ?? [];
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      const found = options.find((option) => option.key.toLowerCase() === lower);
      if (found) return found.key;
    }
    return null;
  }

  /** Free text against both keys and labels — "Graduation" finds the `graduation` option. */
  matchText(topic: ConfigurableTopic, text: string): string | null {
    const lower = text.trim().toLowerCase();
    const options = this.vocabulary[topic] ?? [];
    const found = options.find(
      (option) => option.key.toLowerCase() === lower || option.label.toLowerCase() === lower,
    );
    return found?.key ?? null;
  }

  first(topic: ConfigurableTopic): string | null {
    return this.vocabulary[topic]?.[0]?.key ?? null;
  }
}

function resolveParentage(vocab: Vocabulary, pedigree: string | null): string {
  // No PEDI at all is how most programs write an ordinary biological child —
  // GEDCOM 5.5.1 never says so outright, but treating it as "unknown" would
  // label nearly every imported parent link that way.
  const lower = pedigree?.trim().toLowerCase() ?? "birth";
  return (
    vocab.match("parentage", PARENTAGE_KEYS[lower] ?? []) ??
    vocab.matchText("parentage", lower) ??
    vocab.match("parentage", ["unknown", "birth"]) ??
    "unknown"
  );
}

interface NameParts {
  given: string;
  surname: string;
  prefix: string | null;
  suffix: string | null;
}

/**
 * `1 NAME John Henry /Smith/ Jr.` — the slashes delimit the surname. The
 * GIVN/SURN/SPFX/NPFX/NSFX sub-tags, when present, are more precise than the
 * slash form and win.
 */
function readName(node: GedcomNode): NameParts {
  const slashed = /^(.*?)\/(.*?)\/(.*)$/.exec(node.value);
  let given = (slashed ? slashed[1] : node.value)?.trim() ?? "";
  let surname = slashed?.[2]?.trim() ?? "";
  let suffix: string | null = slashed?.[3]?.trim() || null;

  const givn = childValue(node, "GIVN");
  const surn = childValue(node, "SURN");
  const spfx = childValue(node, "SPFX");
  if (givn) given = givn;
  if (surn)
    surname = spfx && !surn.toLowerCase().startsWith(spfx.toLowerCase()) ? `${spfx} ${surn}` : surn;
  const nsfx = childValue(node, "NSFX");
  if (nsfx) suffix = nsfx;
  // The slash form spells the prefix out in front of the given names
  // ("Dr. Hans /Sørensen/" + NPFX "Dr."); it belongs in `titlePrefix` only.
  const npfx = childValue(node, "NPFX");
  if (npfx && given.startsWith(`${npfx} `)) given = given.slice(npfx.length);
  return {
    given: singleLine(given),
    surname: singleLine(surname),
    prefix: nullableSingleLine(npfx),
    suffix: nullableSingleLine(suffix),
  };
}

/**
 * A GEDCOM 5.5.1 coordinate — a hemisphere letter and decimal degrees
 * (`N55.9`, `W3.25`) — or the bare signed decimal some programs write
 * instead. Null if it isn't one, or is out of range.
 */
function parseCoordinate(
  raw: string | null,
  positive: string,
  negative: string,
  limit: number,
): number | null {
  if (!raw) return null;
  const match = /^([A-Z])?\s*(-?\d+(?:\.\d+)?)$/i.exec(raw.trim().replace(",", "."));
  if (!match) return null;
  const hemisphere = match[1]?.toUpperCase();
  if (hemisphere && hemisphere !== positive && hemisphere !== negative) return null;
  const value = Number(match[2]) * (hemisphere === negative ? -1 : 1);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

/** A free-text event TYPE as a `configurableOptions` key (`^[a-z][a-z0-9_]*$`), or null if nothing usable is left. */
function slugKey(text: string): string | null {
  // NFD below strips accents (é → e) but can't split a letter that isn't
  // "base + accent" — æ/ø/å and friends get their conventional ASCII
  // spellings first, or "Folketælling" would slug to "folket_lling".
  const ascii = text
    .toLowerCase()
    .replace(/[æǽ]/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/œ/g, "oe")
    .replace(/ß/g, "ss")
    .replace(/þ/g, "th")
    .replace(/ð|đ/g, "d")
    .replace(/ł/g, "l");
  const slug = ascii
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return /^[a-z][a-z0-9_]*$/.test(slug) ? slug : null;
}

function formatName(parts: NameParts): string {
  return [parts.given, parts.surname].filter(Boolean).join(" ") || "(unnamed)";
}

function singleLine(text: string, separator = " "): string {
  return text
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(separator);
}

function nullableSingleLine(text: string | null): string | null {
  if (text === null) return null;
  return singleLine(text) || null;
}

function joinNotes(parts: (string | null)[]): string | null {
  const present = parts.map((part) => part?.trim()).filter((part): part is string => !!part);
  return present.length > 0 ? present.join("\n\n") : null;
}
