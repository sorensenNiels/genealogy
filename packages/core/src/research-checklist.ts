import { z } from "zod";

import type { HistoricalDate } from "./person.js";

/**
 * The facts a person's research is "complete" on — in the order worth
 * chasing them: who they were and where from first (birth, parents, the
 * source that proves it), then how their life ended, then a face.
 *
 * A closed `z.enum` rather than a configurable option: code branches on
 * every key (what counts as done, the people list's "Missing…" filter in
 * `PersonService`), so it's structural in CLAUDE.md's sense.
 */
export const researchCheckKeySchema = z.enum([
  "birthDate",
  "birthPlace",
  "parents",
  "birthSource",
  "deathDate",
  "deathPlace",
  "deathSource",
  "photo",
]);
export type ResearchCheckKey = z.infer<typeof researchCheckKeySchema>;

/** The checks that don't apply to someone living — there's no death to research. */
export const DEATH_CHECKS: readonly ResearchCheckKey[] = ["deathDate", "deathPlace", "deathSource"];

export interface ResearchChecklistInput {
  birth: HistoricalDate | null;
  birthPlace: string | null;
  death: HistoricalDate | null;
  deathPlace: string | null;
  isLiving: boolean;
  parentCount: number;
  /** A citation on the birth event itself, not just somewhere on the person. */
  birthCited: boolean;
  deathCited: boolean;
  hasPhoto: boolean;
}

export interface ResearchChecklist {
  checks: { key: ResearchCheckKey; done: boolean }[];
  /** 0–100, of the checks that apply. */
  percent: number;
  /** The first missing check, in research order — what to look for next. */
  next: ResearchCheckKey | null;
}

/** A date with no parsed bounds ("unknown", free text) doesn't count as known. */
function isKnown(date: HistoricalDate | null): boolean {
  return date?.earliest != null || date?.latest != null;
}

/**
 * The "research completeness" checklist on the person page: a plain list of
 * what's there and what's missing, each item equal — deliberately not a
 * weighted score, so it stays predictable ("what's missing?") rather than a
 * black box. Someone living skips the death checks rather than failing
 * them. "Parents" means both: one known parent is still a line to research.
 */
export function researchChecklist(input: ResearchChecklistInput): ResearchChecklist {
  const done: Record<ResearchCheckKey, boolean> = {
    birthDate: isKnown(input.birth),
    birthPlace: !!input.birthPlace?.trim(),
    parents: input.parentCount >= 2,
    birthSource: input.birthCited,
    deathDate: isKnown(input.death),
    deathPlace: !!input.deathPlace?.trim(),
    deathSource: input.deathCited,
    photo: input.hasPhoto,
  };
  const checks = researchCheckKeySchema.options
    .filter((key) => !(input.isLiving && DEATH_CHECKS.includes(key)))
    .map((key) => ({ key, done: done[key] }));
  const doneCount = checks.filter((check) => check.done).length;
  return {
    checks,
    percent: Math.round((doneCount / checks.length) * 100),
    next: checks.find((check) => !check.done)?.key ?? null,
  };
}
