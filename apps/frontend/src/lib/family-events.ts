import type { HistoricalDate } from "@genealogy/core";

/** The fields of a relative this reads — a structural subset of `person.relatives`' rows. */
export interface FamilyEventRelative {
  id: string;
  given: string;
  surname: string;
  gender: string;
  birth: HistoricalDate | null;
  birthPlace: string | null;
  death: HistoricalDate | null;
  deathPlace: string | null;
}

export type FamilyEventKind = "childBirth" | "childDeath" | "spouseDeath" | "parentDeath";

/** Something that happened to a close relative during this person's life. */
export interface FamilyEvent {
  kind: FamilyEventKind;
  relative: FamilyEventRelative;
  date: HistoricalDate;
  place: string | null;
}

function earliestOf(date: HistoricalDate | null): string | null {
  return date?.earliest ?? date?.latest ?? null;
}

function latestOf(date: HistoricalDate | null): string | null {
  return date?.latest ?? date?.earliest ?? null;
}

/**
 * The family events for a person's Life events timeline: children's births
 * and deaths, a spouse's death and the parents' deaths — each only when its
 * date is known and falls within the person's own life (after their birth,
 * and before their death if they're recorded as dead), so a father's death
 * decades after his son's doesn't show in the son's timeline. Relatives a
 * Viewer may only see by name come with no dates, so they never appear.
 * A parent who died before the person's birth isn't included either — the
 * "within the life" rule cuts both ways.
 */
export function familyEvents(
  person: { birth: HistoricalDate | null; death: HistoricalDate | null; isLiving: boolean },
  relatives: {
    parents: readonly FamilyEventRelative[];
    spouses: readonly FamilyEventRelative[];
    children: readonly FamilyEventRelative[];
  },
): FamilyEvent[] {
  const lifeStart = earliestOf(person.birth);
  const lifeEnd = person.isLiving ? null : latestOf(person.death);
  const withinLife = (date: HistoricalDate) => {
    const from = earliestOf(date);
    const to = latestOf(date);
    if (from === null || to === null) return false;
    if (lifeStart !== null && to < lifeStart) return false;
    if (lifeEnd !== null && from > lifeEnd) return false;
    return true;
  };

  const events: FamilyEvent[] = [];
  const add = (
    kind: FamilyEventKind,
    relative: FamilyEventRelative,
    date: HistoricalDate | null,
    place: string | null,
  ) => {
    if (date && withinLife(date)) events.push({ kind, relative, date, place });
  };
  for (const child of relatives.children) {
    add("childBirth", child, child.birth, child.birthPlace);
    add("childDeath", child, child.death, child.deathPlace);
  }
  for (const spouse of relatives.spouses)
    add("spouseDeath", spouse, spouse.death, spouse.deathPlace);
  for (const parent of relatives.parents)
    add("parentDeath", parent, parent.death, parent.deathPlace);
  return events;
}
