import { z } from "zod";

import { historicalDateSchema, personIdSchema } from "./person.js";
import { sourceIdSchema } from "./source.js";

/**
 * The kinds of record that can be entered as written, with everyone in them
 * (see "Records" in TECH_STACK.md). Structural, not configurable: each type's
 * template below decides what saving creates in the tree. Which types are
 * offered is a Settings choice (`recordSettingsSchema.enabledRecordTypes`).
 */
export const recordTypeSchema = z.enum(["census", "baptism", "marriage", "burial"]);
export type RecordType = z.infer<typeof recordTypeSchema>;

/** The as-written columns a record row can have; a template shows a subset. */
export type RecordColumn =
  | "role"
  | "name"
  | "sex"
  | "age"
  | "maritalStatus"
  | "occupation"
  | "residence"
  | "birthplace";

/**
 * What a record type is made of and what saving it does:
 *
 * - `roles`: the role keys a row can have (i18n `records.role.<type>.<key>`).
 *   Census has none of its own — its rows' role is a household position, a
 *   configurable `household_position` option.
 * - `principalRoles`: rows that get the record's event (or, for a marriage,
 *   the union between the two).
 * - `eventType`: the event principals get (null for marriage — a union).
 * - `associationRoles`: rows recorded as an association on the principal's
 *   event or union — a godparent, a witness — keyed to `association_role`.
 */
export interface RecordTemplate {
  type: RecordType;
  roles: readonly string[];
  principalRoles: readonly string[];
  eventType: string | null;
  associationRoles: Readonly<Record<string, string>>;
  columns: readonly RecordColumn[];
  /** Label of the record-level "address" field (i18n `records.address.<key>`). */
  addressKind: "address" | "church" | "cemetery";
  /** Label of the record-level reference (i18n `records.reference.<key>`). */
  referenceKind: "household" | "entry";
}

export const RECORD_TEMPLATES: Readonly<Record<RecordType, RecordTemplate>> = {
  census: {
    type: "census",
    roles: [],
    principalRoles: [],
    eventType: "census",
    associationRoles: {},
    columns: ["name", "sex", "age", "role", "maritalStatus", "occupation", "birthplace"],
    addressKind: "address",
    referenceKind: "household",
  },
  baptism: {
    type: "baptism",
    roles: ["child", "father", "mother", "godparent", "officiant", "other"],
    principalRoles: ["child"],
    eventType: "christening",
    associationRoles: { godparent: "godparent", officiant: "officiant" },
    columns: ["role", "name", "sex", "occupation", "residence"],
    addressKind: "church",
    referenceKind: "entry",
  },
  marriage: {
    type: "marriage",
    roles: [
      "groom",
      "bride",
      "groomFather",
      "groomMother",
      "brideFather",
      "brideMother",
      "witness",
      "officiant",
      "other",
    ],
    principalRoles: ["groom", "bride"],
    eventType: null,
    associationRoles: { witness: "witness", officiant: "officiant" },
    columns: ["role", "name", "age", "maritalStatus", "occupation", "residence", "birthplace"],
    addressKind: "church",
    referenceKind: "entry",
  },
  burial: {
    type: "burial",
    roles: ["deceased", "spouse", "informant", "officiant", "other"],
    principalRoles: ["deceased"],
    eventType: "burial",
    associationRoles: { informant: "informant", officiant: "officiant" },
    columns: ["role", "name", "age", "occupation", "residence"],
    addressKind: "cemetery",
    referenceKind: "entry",
  },
};

/**
 * Census rows' role is a household position; every census row linked to a
 * person gets the census event, not just one principal.
 */
export function isPrincipal(type: RecordType, role: string): boolean {
  return type === "census" || RECORD_TEMPLATES[type].principalRoles.includes(role);
}

export const recordIdSchema = z.uuid();

/** One person as named in a record — everything as written. */
export const recordPersonInputSchema = z.object({
  /** Present for an existing row, so what it created can be kept rather than recreated. */
  id: z.uuid().optional(),
  /** A template role key, or for a census a `household_position` key; "" when not given. */
  role: z.string().trim().default(""),
  name: z.string().trim().default(""),
  sex: z.enum(["M", "F", "U"]).default("U"),
  age: z.string().trim().default(""),
  maritalStatus: z.string().trim().default(""),
  occupation: z.string().trim().default(""),
  residence: z.string().trim().default(""),
  birthplace: z.string().trim().default(""),
  /** The person in the tree this row is, if linked. */
  personId: personIdSchema.nullable().default(null),
});
export type RecordPersonInput = z.infer<typeof recordPersonInputSchema>;

/** A whole record as saved from the editor: what, when, where, the source, and its people in order. */
export const recordInputSchema = z.object({
  id: recordIdSchema.optional(),
  recordType: recordTypeSchema,
  /** For a census: the census definition (`censusDefinitionSchema.key`). */
  censusKey: z.string().trim().nullable().default(null),
  date: historicalDateSchema.nullable().default(null),
  /** Parish, village or town. */
  place: z.string().trim().default(""),
  /** Address or farm (census), church (baptism/marriage) or cemetery (burial). */
  address: z.string().trim().default(""),
  /** Household number (census) or entry number. */
  reference: z.string().trim().default(""),
  sourceId: sourceIdSchema.nullable().default(null),
  page: z.string().trim().default(""),
  url: z.string().trim().default(""),
  notes: z.string().trim().default(""),
  people: z.array(recordPersonInputSchema).max(200),
});
export type RecordInput = z.infer<typeof recordInputSchema>;

/** "Searched this census for this person, and they weren't there." */
export const recordSearchInputSchema = z.object({
  personId: personIdSchema,
  censusKey: z.string().trim().min(1),
  note: z.string().trim().default(""),
});
export type RecordSearchInput = z.infer<typeof recordSearchInputSchema>;

/** A family link a record implies — suggested for one click (or made, per Settings). */
export type RelationshipCandidate =
  | { kind: "parent"; parentId: string; childId: string }
  | { kind: "spouse"; aId: string; bId: string };

/**
 * The family links a record's rows imply, among the rows linked to people:
 *
 * - baptism: father/mother → parent of the child;
 * - marriage: each father/mother → parent of the groom or bride;
 * - census: the head's wife/husband → spouse of the head; the head and their
 *   spouse → parents of each son/daughter/child; a "parent" row → parent of
 *   the head. (Step- and foster children, grandchildren, in-laws and
 *   servants imply nothing certain.)
 *
 * Which of these already exist is the backend's job (it knows the graph).
 */
export function relationshipCandidates(
  type: RecordType,
  rows: ReadonlyArray<{ role: string; personId: string | null }>,
): RelationshipCandidate[] {
  const linked = (role: string) =>
    rows.filter((row) => row.role === role && row.personId).map((row) => row.personId!);
  const candidates: RelationshipCandidate[] = [];
  const parents = (parentIds: string[], childIds: string[]) => {
    for (const parentId of parentIds) {
      for (const childId of childIds) {
        if (parentId !== childId) candidates.push({ kind: "parent", parentId, childId });
      }
    }
  };

  if (type === "baptism") {
    parents([...linked("father"), ...linked("mother")], linked("child"));
  } else if (type === "marriage") {
    parents([...linked("groomFather"), ...linked("groomMother")], linked("groom"));
    parents([...linked("brideFather"), ...linked("brideMother")], linked("bride"));
  } else if (type === "census") {
    const heads = linked("head");
    const spouses = [...linked("wife"), ...linked("husband")];
    for (const head of heads) {
      for (const spouse of spouses) {
        if (head !== spouse) candidates.push({ kind: "spouse", aId: head, bId: spouse });
      }
    }
    parents([...heads, ...spouses], [...linked("son"), ...linked("daughter"), ...linked("child")]);
    parents(linked("parent"), heads);
  }

  // One per pair.
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key =
      candidate.kind === "parent"
        ? `p:${candidate.parentId}:${candidate.childId}`
        : `s:${[candidate.aId, candidate.bId].toSorted().join(":")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
