import type { HistoricalDate } from "./person.js";

/**
 * Consistency warnings: facts about a person and their family that can't
 * all be true — death before birth, a mother aged 9, a child born a year
 * after their mother's burial. Each check only fires when *no* reading of
 * the dates works: dates are compared on their bounds (`earliest`/`latest`),
 * so "abt 1850" or "1850–1855" gives every benefit of the doubt, and a date
 * that didn't parse (no bounds) is never flagged. Mistyped imports are what
 * this is for, not vague records.
 *
 * Pure, so the person page computes its own warnings from what it already
 * loaded and the Tools report runs the same rules over the whole tree.
 */

/** The limits, from Settings → Person page. 0 turns a check off. */
export interface ConsistencyRules {
  /** Youngest a parent can plausibly be at a child's birth. */
  minParentAge: number;
  /** Oldest a mother can plausibly be at a child's birth. */
  maxMotherAge: number;
  /** Youngest a person can plausibly marry. */
  minMarriageAge: number;
}

export interface ConsistencyPerson {
  id: string;
  given: string;
  surname: string;
  gender: string;
  birth: HistoricalDate | null;
  death: HistoricalDate | null;
  burial: HistoricalDate | null;
}

export interface ConsistencyInput {
  person: ConsistencyPerson;
  /** The person's own life events, birth/death/burial included or not — those types are skipped here. */
  events: ReadonlyArray<{ eventType: string; date: HistoricalDate | null }>;
  unions: ReadonlyArray<{
    startDate: HistoricalDate | null;
    partner: { id: string; given: string; surname: string } | null;
  }>;
  /** Birth parents only (`isBirthParentage`) — an adoptive or step-parent's age says nothing about a birth. */
  parents: readonly ConsistencyPerson[];
  /** The person's birth children; leave empty to check only the person as a child (the tree-wide report does, so a pair isn't reported twice). */
  children: readonly ConsistencyPerson[];
}

export interface ConsistencyRelative {
  id: string;
  given: string;
  surname: string;
}

export type ConsistencyIssue =
  | { kind: "deathBeforeBirth" }
  | { kind: "burialBeforeDeath" }
  | { kind: "eventBeforeBirth"; eventType: string }
  | { kind: "eventAfterBurial"; eventType: string }
  | { kind: "marriedTooYoung"; age: number; relative: ConsistencyRelative | null }
  /** As the child: a parent was at most `age` at this person's birth. */
  | { kind: "parentTooYoung"; age: number; relative: ConsistencyRelative }
  | { kind: "motherTooOld"; age: number; relative: ConsistencyRelative }
  | { kind: "bornAfterMotherDied"; relative: ConsistencyRelative }
  | { kind: "bornLongAfterFatherDied"; relative: ConsistencyRelative }
  /** As the parent: this person was at most `age` when `relative` was born. */
  | { kind: "childWhileTooYoung"; age: number; relative: ConsistencyRelative }
  | { kind: "childWhileTooOld"; age: number; relative: ConsistencyRelative }
  | { kind: "childAfterDeath"; relative: ConsistencyRelative };

export type ConsistencyIssueKind = ConsistencyIssue["kind"];

/**
 * Whether a parent link's parentage counts for the birth checks: "birth",
 * and "unknown" — what a link made without saying is, and in practice
 * nearly always a birth parent. Adopted, step and foster parents don't.
 */
export function isBirthParentage(parentage: string): boolean {
  return parentage === "birth" || parentage === "unknown";
}

/** Events that belong after death and before birth by nature, so never flagged against them. */
const AFTER_BURIAL_OK = new Set(["burial", "cremation", "death"]);
const VITAL_TYPES = new Set(["birth", "death", "burial"]);

const earliestOf = (date: HistoricalDate | null) => date?.earliest ?? date?.latest ?? null;
const latestOf = (date: HistoricalDate | null) => date?.latest ?? date?.earliest ?? null;

/** Whole years from one ISO day to another (negative if `to` is first). */
export function wholeYears(from: string, to: string): number {
  const years = Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  return to.slice(5) < from.slice(5) ? years - 1 : years;
}

/** An ISO day `years` later — for a father's death, plus the months a birth can follow it. */
function plusYears(iso: string, years: number): string {
  return `${String(Number(iso.slice(0, 4)) + years).padStart(4, "0")}${iso.slice(4)}`;
}

/**
 * The oldest someone born `birth` can have been on `day` — the widest
 * reading of both dates. Null when either has no bounds.
 */
function maxAgeAt(birth: HistoricalDate | null, day: HistoricalDate | null): number | null {
  const born = earliestOf(birth);
  const at = latestOf(day);
  return born && at ? wholeYears(born, at) : null;
}

/** The youngest someone born `birth` can have been on `day`. */
function minAgeAt(birth: HistoricalDate | null, day: HistoricalDate | null): number | null {
  const born = latestOf(birth);
  const at = earliestOf(day);
  return born && at ? wholeYears(born, at) : null;
}

/** Whether `a` certainly ended before `b` began. */
function certainlyBefore(a: HistoricalDate | null, b: HistoricalDate | null): boolean {
  const end = latestOf(a);
  const start = earliestOf(b);
  return end !== null && start !== null && end < start;
}

const ref = (person: ConsistencyRelative): ConsistencyRelative => ({
  id: person.id,
  given: person.given,
  surname: person.surname,
});

/**
 * The parent-and-child checks for one pair, from either side — the same
 * facts read as "parentTooYoung" on the child's page and
 * "childWhileTooYoung" on the parent's.
 */
function pairIssues(
  parent: ConsistencyPerson,
  child: ConsistencyPerson,
  rules: ConsistencyRules,
): { kind: "tooYoung" | "tooOld" | "afterMotherDied" | "longAfterFatherDied"; age?: number }[] {
  const found: {
    kind: "tooYoung" | "tooOld" | "afterMotherDied" | "longAfterFatherDied";
    age?: number;
  }[] = [];
  if (rules.minParentAge > 0) {
    const age = maxAgeAt(parent.birth, child.birth);
    if (age !== null && age < rules.minParentAge) found.push({ kind: "tooYoung", age });
  }
  if (rules.maxMotherAge > 0 && parent.gender === "F") {
    const age = minAgeAt(parent.birth, child.birth);
    if (age !== null && age > rules.maxMotherAge) found.push({ kind: "tooOld", age });
  }
  if (parent.gender === "F" && certainlyBefore(parent.death ?? parent.burial, child.birth)) {
    found.push({ kind: "afterMotherDied" });
  }
  // A father can die before the birth; a year covers any pregnancy.
  const fatherDied = latestOf(parent.death ?? parent.burial);
  const born = earliestOf(child.birth);
  if (parent.gender === "M" && fatherDied && born && plusYears(fatherDied, 1) < born) {
    found.push({ kind: "longAfterFatherDied" });
  }
  return found;
}

/** Everything about `input.person` that can't all be true, under `rules`. */
export function consistencyIssues(
  input: ConsistencyInput,
  rules: ConsistencyRules,
): ConsistencyIssue[] {
  const { person } = input;
  const issues: ConsistencyIssue[] = [];

  if (certainlyBefore(person.death, person.birth)) issues.push({ kind: "deathBeforeBirth" });
  if (certainlyBefore(person.burial, person.death)) issues.push({ kind: "burialBeforeDeath" });

  for (const event of input.events) {
    if (VITAL_TYPES.has(event.eventType)) continue;
    if (certainlyBefore(event.date, person.birth)) {
      issues.push({ kind: "eventBeforeBirth", eventType: event.eventType });
    }
    if (!AFTER_BURIAL_OK.has(event.eventType) && certainlyBefore(person.burial, event.date)) {
      issues.push({ kind: "eventAfterBurial", eventType: event.eventType });
    }
  }

  for (const union of input.unions) {
    if (certainlyBefore(union.startDate, person.birth)) {
      issues.push({ kind: "eventBeforeBirth", eventType: "marriage" });
      continue;
    }
    if (certainlyBefore(person.burial, union.startDate)) {
      issues.push({ kind: "eventAfterBurial", eventType: "marriage" });
    }
    if (rules.minMarriageAge > 0) {
      const age = maxAgeAt(person.birth, union.startDate);
      if (age !== null && age < rules.minMarriageAge) {
        issues.push({
          kind: "marriedTooYoung",
          age,
          relative: union.partner && ref(union.partner),
        });
      }
    }
  }

  for (const parent of input.parents) {
    for (const found of pairIssues(parent, person, rules)) {
      const relative = ref(parent);
      if (found.kind === "tooYoung")
        issues.push({ kind: "parentTooYoung", age: found.age!, relative });
      else if (found.kind === "tooOld")
        issues.push({ kind: "motherTooOld", age: found.age!, relative });
      else if (found.kind === "afterMotherDied")
        issues.push({ kind: "bornAfterMotherDied", relative });
      else issues.push({ kind: "bornLongAfterFatherDied", relative });
    }
  }

  for (const child of input.children) {
    for (const found of pairIssues(person, child, rules)) {
      const relative = ref(child);
      if (found.kind === "tooYoung")
        issues.push({ kind: "childWhileTooYoung", age: found.age!, relative });
      else if (found.kind === "tooOld")
        issues.push({ kind: "childWhileTooOld", age: found.age!, relative });
      else issues.push({ kind: "childAfterDeath", relative });
    }
  }

  return issues;
}
