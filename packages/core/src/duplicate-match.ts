import { z } from "zod";

import { personIdSchema, type HistoricalDate } from "./person.js";

/**
 * Duplicate person detection: which pairs of people in the tree look like
 * the same person recorded twice (most often after a GEDCOM import, which
 * adds everyone as new people). Framework-free so the scoring can be
 * unit-tested on its own; the backend only gathers the inputs.
 *
 * Built around two things that make Danish trees awkward:
 *
 * - **Spelling varies freely** before standardised orthography: Søren/Sören,
 *   Christensen/Kristensen, Petersen/Pedersen, Nielsen/Nilsen, Aage/Åge. Names
 *   are compared by a folded "sound key", not as written.
 * - **Equal surnames say little.** Before the naming laws a son of Søren is a
 *   Sørensen, so half a parish shares a handful of surnames, and a daughter
 *   recorded as Sørensdatter in one record is Sørensen in the next. A name
 *   match alone is therefore only ever "low" confidence; dates, places and
 *   relatives are what lift a pair above it.
 */

export const duplicateReasonSchema = z.enum([
  "sameName",
  "similarName",
  "sameBirthDate",
  "similarBirthDate",
  "sameDeathDate",
  "similarDeathDate",
  "sameBirthPlace",
  "sameDeathPlace",
  "sameParents",
  "sameSpouse",
]);
export type DuplicateReason = z.infer<typeof duplicateReasonSchema>;

export const duplicateConfidenceSchema = z.enum(["high", "medium", "low"]);
export type DuplicateConfidence = z.infer<typeof duplicateConfidenceSchema>;

/** Everything about one person the matcher looks at. */
export interface DuplicateMatchPerson {
  id: string;
  given: string;
  surname: string;
  gender: "M" | "F" | "U";
  /** Alternate names (birth name, married name, ...) — a match on any of them counts. */
  otherNames: { given: string; surname: string }[];
  /** Birth, or christening/baptism when there's no birth — church books record the baptism. */
  birth: HistoricalDate | null;
  birthPlace: string | null;
  /** Death, or burial when there's no death. */
  death: HistoricalDate | null;
  deathPlace: string | null;
  parents: { id: string; given: string; surname: string }[];
  spouses: { id: string; given: string; surname: string }[];
  /** Parents, children and spouses — a person is never a duplicate of their own relative. */
  relativeIds: ReadonlySet<string>;
}

/**
 * Folding and sound keys are pure and the same few hundred names come up
 * over and over — a whole-tree run compares each name thousands of times —
 * so both are cached. Cleared when large rather than evicted one by one;
 * the next run just warms it again.
 */
const foldCache = new Map<string, string>();
const soundCache = new Map<string, string>();
const MAX_CACHED_NAMES = 50_000;

function memo(cache: Map<string, string>, input: string, compute: () => string): string {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  if (cache.size >= MAX_CACHED_NAMES) cache.clear();
  const value = compute();
  cache.set(input, value);
  return value;
}

export interface DuplicateMatch {
  score: number;
  confidence: DuplicateConfidence;
  reasons: DuplicateReason[];
}

/**
 * Lower-cases, spells æ/ø/å and their German/Swedish cousins out the way old
 * records and ASCII-only files do (ae/oe/aa), strips any other accent and
 * drops everything but letters and spaces. Two spellings that fold the same
 * are the same name as written; `soundKey` goes further.
 */
export function foldName(value: string): string {
  return memo(foldCache, value, () =>
    value
      .toLowerCase()
      .replaceAll("æ", "ae")
      .replaceAll("ä", "ae")
      .replaceAll("ø", "oe")
      .replaceAll("ö", "oe")
      .replaceAll("å", "aa")
      .replaceAll("ü", "ue")
      .normalize("NFD")
      .replaceAll(/\p{M}/gu, "")
      .replaceAll(/[^a-z\s]/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim(),
  );
}

/**
 * One folded name word reduced to how it sounds, so the common Danish
 * spelling variants land on the same key: Christensen/Kristensen (ch, c →
 * k), Petersen/Pedersen (d between vowels → t), Nielsen/Nilsen (ie → i),
 * Mathias/Matthias (th → t, doubled letters collapse), Aage/Åge (aa → a),
 * Søren/Sören/Soeren (all oe). Deliberately conservative: a key that's too
 * loose turns every Jens into every Hans.
 */
export function soundKey(word: string): string {
  return memo(soundCache, word, () => computeSoundKey(word));
}

function computeSoundKey(word: string): string {
  let key = foldName(word).replaceAll(" ", "");
  key = key
    .replaceAll("ph", "f")
    .replaceAll("th", "t")
    .replaceAll("dt", "t")
    .replaceAll("ch", "k")
    .replaceAll("ck", "k")
    .replaceAll("c", "k")
    .replaceAll("q", "k")
    .replaceAll("x", "ks")
    .replaceAll("z", "s")
    .replaceAll("w", "v")
    .replaceAll("y", "i")
    .replaceAll("ie", "i");
  // Collapse doubles before and after the vowel rule: "aa" (å) becomes "a",
  // and "Pedder" becomes "Peder" before its d is softened.
  key = key.replaceAll(/(.)\1+/g, "$1");
  key = key.replaceAll(/([aeiou])d(?=[aeiou])/g, "$1t");
  return key.replaceAll(/(.)\1+/g, "$1");
}

/**
 * Patronymic endings, as sound keys, after the father's name and its
 * genitive s: Søren-s-en, Søren-s-datter, Jens-en, Jens-datter. Cutting back
 * to the s leaves "soerens" and "jens" for both a son and a daughter. The
 * abbreviation "dtr." appears as "tr": `soundKey` has already made its "dt" a "t".
 */
const PATRONYMIC_SUFFIX = /s(en|on|oen|dater|doter|tr)$/;

/**
 * A surname's sound key with any patronymic ending removed, so Sørensen,
 * Sørensdatter and Sörensen all come down to "soerens". Two people sharing
 * only this are a son and daughter of a Søren — or one woman recorded both
 * ways — which is why it counts for less than an equal surname.
 */
export function surnameStem(surname: string): string {
  const key = soundKey(surname);
  const stem = key.replace(PATRONYMIC_SUFFIX, "s");
  // Too short to mean anything once stripped (a bare "Sen").
  return stem.length >= 3 ? stem : key;
}

/** The sound key of every given name a person has, in order: "Anne Marie" → ["ane", "mari"]. */
export function givenKeys(given: string): string[] {
  return foldName(given)
    .split(" ")
    .filter((word) => word !== "")
    .map(soundKey);
}

/**
 * The key the GEDCOM import preview groups by — the sound keys of every
 * given name plus the surname's — so it and duplicate detection agree on
 * which names are "the same name". `null` without a surname: a bare
 * "Maren" matches far too many people to be worth reporting.
 */
export function nameMatchKey(person: { given: string; surname: string }): string | null {
  const surname = soundKey(person.surname);
  if (surname === "") return null;
  return `${givenKeys(person.given).join(" ")}|${surname}`;
}

/**
 * Keys two people must share at least one of before they're compared at
 * all: every given name with the surname stem, and (for married women
 * recorded under two surnames) every given name with the birth year. Keeps
 * a tree of thousands from turning into millions of pairs.
 */
export function duplicateBlockingKeys(person: DuplicateMatchPerson): string[] {
  const keys = new Set<string>();
  const birthYear = person.birth?.earliest?.slice(0, 4) ?? null;
  for (const name of [person, ...person.otherNames]) {
    const stem = surnameStem(name.surname);
    for (const given of givenKeys(name.given)) {
      if (stem !== "") keys.add(`n:${given}|${stem}`);
      if (birthYear) keys.add(`b:${given}|${birthYear}`);
    }
  }
  return [...keys];
}

type NameLevel = "same" | "similar" | "none" | "conflict";

/** How well two given names agree: all names equal, one a subset of the other (Anne Marie / Marie), or not at all. */
function compareGiven(a: string, b: string): NameLevel {
  const aKeys = givenKeys(a);
  const bKeys = givenKeys(b);
  if (aKeys.length === 0 || bKeys.length === 0) return "none";
  if (foldName(a) === foldName(b)) return "same";
  if (aKeys.join(" ") === bKeys.join(" ")) return "similar";
  const [shorter, longer] = aKeys.length <= bKeys.length ? [aKeys, bKeys] : [bKeys, aKeys];
  if (shorter.every((key) => longer.includes(key))) return "similar";
  return "conflict";
}

function compareSurname(a: string, b: string): NameLevel {
  if (foldName(a) === "" || foldName(b) === "") return "none";
  if (foldName(a) === foldName(b)) return "same";
  if (soundKey(a) === soundKey(b)) return "similar";
  if (surnameStem(a) === surnameStem(b)) return "similar";
  return "conflict";
}

interface NameAgreement {
  level: "same" | "similar";
  points: number;
  /** Both have a surname and they agree — without it a name match alone isn't worth reporting. */
  surnameAgrees: boolean;
}

/**
 * The best agreement between any of A's names and any of B's: "same" when a
 * given name and surname are both spelled alike, "similar" for variant
 * spellings or a shared subset of given names, `null` when no pair of names
 * agrees on the given name. A differing surname is tolerated (marriage
 * changes it) but scores nothing.
 */
function compareNames(a: DuplicateMatchPerson, b: DuplicateMatchPerson): NameAgreement | null {
  let best: NameAgreement | null = null;
  for (const nameA of [a, ...a.otherNames]) {
    for (const nameB of [b, ...b.otherNames]) {
      const given = compareGiven(nameA.given, nameB.given);
      if (given === "none" || given === "conflict") continue;
      const surname = compareSurname(nameA.surname, nameB.surname);
      const points =
        (given === "same" ? 30 : 20) + (surname === "same" ? 25 : surname === "similar" ? 15 : 0);
      const level = given === "same" && surname === "same" ? "same" : "similar";
      if (!best || points > best.points) {
        best = { level, points, surnameAgrees: surname === "same" || surname === "similar" };
      }
    }
  }
  return best;
}

/** A given name in common and no surname conflict — loose on purpose, since it only corroborates. */
function namesAgree(a: { given: string; surname: string }, b: { given: string; surname: string }) {
  const given = compareGiven(a.given, b.given);
  return (
    (given === "same" || given === "similar") && compareSurname(a.surname, b.surname) !== "conflict"
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How two dates agree, judged on their `earliest`/`latest` bounds: "same"
 * when both are exact to the day and equal, "similar" when their ranges
 * overlap or lie within two years, "conflict" beyond five years (a range
 * that wide is a different person, not a transcription slip). Anything in
 * between — or an unparsed date — says nothing either way.
 */
export function compareDates(
  a: HistoricalDate | null,
  b: HistoricalDate | null,
): "same" | "similar" | "conflict" | null {
  if (!a?.earliest || !a.latest || !b?.earliest || !b.latest) return null;
  const aStart = Date.parse(a.earliest);
  const aEnd = Date.parse(a.latest);
  const bStart = Date.parse(b.earliest);
  const bEnd = Date.parse(b.latest);
  if (aStart === aEnd && bStart === bEnd && aStart === bStart) return "same";
  const gapDays = Math.max(0, aStart - bEnd, bStart - aEnd) / DAY_MS;
  if (gapDays <= 2 * 365) return "similar";
  if (gapDays > 5 * 365) return "conflict";
  return null;
}

/**
 * A place's first part only: "Brande, Ringkøbing, Danmark" and "Brande" are
 * the same parish written with and without its county.
 */
function placeHead(place: string): string {
  return foldName(place.split(",")[0] ?? "");
}

function samePlace(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return placeHead(a) !== "" && placeHead(a) === placeHead(b);
}

function sameRelative(
  as: DuplicateMatchPerson["parents"],
  bs: DuplicateMatchPerson["parents"],
): boolean {
  return as.some((a) => bs.some((b) => a.id === b.id || namesAgree(a, b)));
}

/**
 * Scores one pair, or `null` when they can't be the same person (no given
 * name in common, different genders, birth or death dates years apart,
 * already each other's parent, child or spouse) or when nothing but a
 * given name links them.
 *
 * Confidence is rule-based rather than a score threshold, so the Tools page
 * can say why: a name match alone is "low"; one corroborating fact (a
 * close date, a place, a parent or spouse of the same name) makes it
 * "medium"; an identical full date, or two corroborating facts, "high".
 */
export function scoreDuplicate(
  a: DuplicateMatchPerson,
  b: DuplicateMatchPerson,
): DuplicateMatch | null {
  if (a.id === b.id || a.relativeIds.has(b.id) || b.relativeIds.has(a.id)) return null;
  if (a.gender !== "U" && b.gender !== "U" && a.gender !== b.gender) return null;

  const names = compareNames(a, b);
  if (!names) return null;

  const birth = compareDates(a.birth, b.birth);
  const death = compareDates(a.death, b.death);
  if (birth === "conflict" || death === "conflict") return null;
  // Children of the same parents, both dated, born years apart: siblings
  // given the same name — the custom when a child died young — not one
  // person recorded twice.
  const shareParent = a.parents.some((parent) => b.parents.some((other) => other.id === parent.id));
  if (shareParent && a.birth?.earliest && b.birth?.earliest && birth === null) return null;

  const reasons: DuplicateReason[] = [names.level === "same" ? "sameName" : "similarName"];
  let score = names.points;
  let corroborations = 0;
  const add = (reason: DuplicateReason, points: number) => {
    reasons.push(reason);
    score += points;
    corroborations += 1;
  };

  if (birth === "same") add("sameBirthDate", 30);
  else if (birth === "similar") add("similarBirthDate", 15);
  if (death === "same") add("sameDeathDate", 30);
  else if (death === "similar") add("similarDeathDate", 15);
  if (samePlace(a.birthPlace, b.birthPlace)) add("sameBirthPlace", 10);
  if (samePlace(a.deathPlace, b.deathPlace)) add("sameDeathPlace", 10);
  if (sameRelative(a.parents, b.parents)) add("sameParents", 20);
  if (sameRelative(a.spouses, b.spouses)) add("sameSpouse", 20);

  if (corroborations === 0 && !names.surnameAgrees) return null;
  const exactDate = birth === "same" || death === "same";
  const confidence: DuplicateConfidence =
    exactDate || corroborations >= 2 ? "high" : corroborations === 1 ? "medium" : "low";
  return { score, confidence, reasons };
}

/**
 * A bare name match ("low") is only reported for a name at most this many
 * people in the tree share. Three Jens Jensens are worth a look; thirty are
 * a parish, and listing every pair of them buries the real duplicates.
 */
export const MAX_NAME_ONLY_GROUP = 3;

export interface DuplicatePair extends DuplicateMatch {
  aId: string;
  bId: string;
}

/**
 * Every likely duplicate pair among `people`, best first. With `onlyId`,
 * just the pairs involving that one person (the person page's "Merge
 * with…" suggestions). `isDismissed` drops pairs an admin has already
 * marked "not a duplicate". Bare name matches on a common name are left
 * out (see `MAX_NAME_ONLY_GROUP`).
 */
export function findDuplicatePairs(
  people: readonly DuplicateMatchPerson[],
  options: { onlyId?: string; isDismissed?: (aId: string, bId: string) => boolean } = {},
): DuplicatePair[] {
  const byKey = new Map<string, DuplicateMatchPerson[]>();
  const keysOf = new Map<string, string[]>();
  const nameCounts = new Map<string, number>();
  const nameCount = (person: DuplicateMatchPerson) => {
    const key = nameMatchKey(person);
    return key ? (nameCounts.get(key) ?? 0) : 0;
  };
  for (const person of people) {
    const nameKey = nameMatchKey(person);
    if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1);
    const keys = duplicateBlockingKeys(person);
    keysOf.set(person.id, keys);
    for (const key of keys) {
      const bucket = byKey.get(key);
      if (bucket) bucket.push(person);
      else byKey.set(key, [person]);
    }
  }

  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];
  const consider = (a: DuplicateMatchPerson, b: DuplicateMatchPerson) => {
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    const pairKey = `${first.id}|${second.id}`;
    if (first.id === second.id || seen.has(pairKey)) return;
    seen.add(pairKey);
    if (options.isDismissed?.(first.id, second.id)) return;
    const match = scoreDuplicate(first, second);
    if (!match) return;
    if (
      match.confidence === "low" &&
      Math.max(nameCount(first), nameCount(second)) > MAX_NAME_ONLY_GROUP
    ) {
      return;
    }
    pairs.push({ aId: first.id, bId: second.id, ...match });
  };

  if (options.onlyId) {
    const target = people.find((person) => person.id === options.onlyId);
    if (!target) return [];
    for (const key of keysOf.get(target.id) ?? []) {
      for (const other of byKey.get(key) ?? []) consider(target, other);
    }
  } else {
    for (const bucket of byKey.values()) {
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) consider(bucket[i]!, bucket[j]!);
      }
    }
  }

  const rank: Record<DuplicateConfidence, number> = { high: 0, medium: 1, low: 2 };
  return pairs.toSorted((x, y) => rank[x.confidence] - rank[y.confidence] || y.score - x.score);
}

export const duplicatePairInputSchema = z.object({
  personAId: personIdSchema,
  personBId: personIdSchema,
});
export type DuplicatePairInput = z.infer<typeof duplicatePairInputSchema>;
