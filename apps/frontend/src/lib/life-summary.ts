import type { HistoricalDate } from "@genealogy/core";

/** One point on the "life at a glance" line: birth, each union, death. */
export interface LifeMilestone {
  kind: "birth" | "union" | "death";
  date: HistoricalDate | null;
  place: string | null;
  /** Whole years since birth at this point; null when either date is unknown (or for the birth itself). */
  age: number | null;
  /** For a union: who with, and its status key (`union_status` — "married", ...). */
  partner?: { id: string | null; name: string };
  unionStatus?: string;
}

/**
 * One sentence of the summary, as an i18n key under
 * `person.lifeSummary.` plus its values. Whole sentences per combination of
 * known facts rather than glued fragments, so each language can phrase
 * them naturally.
 */
export interface SummarySentence {
  key: string;
  params: Record<string, string | number>;
}

export interface LifeSummaryInput {
  person: {
    isLiving: boolean;
    birth: HistoricalDate | null;
    birthPlace: string | null;
    death: HistoricalDate | null;
    deathPlace: string | null;
  };
  unions: ReadonlyArray<{
    startDate: HistoricalDate | null;
    startPlace: string | null;
    status: string;
    partnerId: string | null;
    partnerName: string;
  }>;
  childCount: number;
  /** Our localized display of a date (`formatDisplayDate`). */
  formatDate: (date: HistoricalDate) => string | null;
  today?: Date;
}

function earliestOf(date: HistoricalDate | null): string | null {
  return date?.earliest ?? date?.latest ?? null;
}

/** Whole years from `from` to `to` (ISO dates); null if either is missing or `to` is before `from`. */
export function yearsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  const hadBirthday =
    end.getUTCMonth() > start.getUTCMonth() ||
    (end.getUTCMonth() === start.getUTCMonth() && end.getUTCDate() >= start.getUTCDate());
  if (!hadBirthday) years -= 1;
  return years >= 0 ? years : null;
}

/**
 * The person's life as milestones (birth, each union in date order, death)
 * and a short summary in the telegraphic style of a family history: "Born 3
 * Mar 1850 in Ribe. Married Karen Hansdatter (12 Oct 1874). Had 6 children.
 * Died 1 Jun 1921 in Esbjerg, aged 71." Only what's known is said; a
 * living person's summary ends with their current age instead of a death.
 */
export function lifeAtAGlance(input: LifeSummaryInput): {
  milestones: LifeMilestone[];
  sentences: SummarySentence[];
} {
  const { person, formatDate } = input;
  const born = earliestOf(person.birth);
  const dateText = (date: HistoricalDate | null) => (date ? formatDate(date) : null);

  const milestones: LifeMilestone[] = [];
  const sentences: SummarySentence[] = [];

  // Birth.
  const birthDate = dateText(person.birth);
  if (birthDate || person.birthPlace) {
    milestones.push({
      kind: "birth",
      date: person.birth,
      place: person.birthPlace,
      age: null,
    });
  }
  if (birthDate && person.birthPlace) {
    sentences.push({ key: "bornDatePlace", params: { date: birthDate, place: person.birthPlace } });
  } else if (birthDate) {
    sentences.push({ key: "bornDate", params: { date: birthDate } });
  } else if (person.birthPlace) {
    sentences.push({ key: "bornPlace", params: { place: person.birthPlace } });
  }

  // Unions, oldest first; undated ones after.
  const unions = input.unions.toSorted((a, b) =>
    (earliestOf(a.startDate) ?? "9999").localeCompare(earliestOf(b.startDate) ?? "9999"),
  );
  for (const union of unions) {
    milestones.push({
      kind: "union",
      date: union.startDate,
      place: union.startPlace,
      age: yearsBetween(born, earliestOf(union.startDate)),
      partner: { id: union.partnerId, name: union.partnerName },
      unionStatus: union.status,
    });
    if (union.status !== "married") continue;
    const date = dateText(union.startDate);
    sentences.push(
      date
        ? { key: "marriedDate", params: { spouse: union.partnerName, date } }
        : { key: "married", params: { spouse: union.partnerName } },
    );
  }

  if (input.childCount > 0) {
    sentences.push({ key: "children", params: { count: input.childCount } });
  }

  // Death, or the current age.
  if (person.isLiving) {
    const age = yearsBetween(born, (input.today ?? new Date()).toISOString().slice(0, 10));
    if (age !== null) sentences.push({ key: "living", params: { age } });
  } else {
    const deathDate = dateText(person.death);
    const age = yearsBetween(born, earliestOf(person.death));
    if (deathDate || person.deathPlace) {
      milestones.push({ kind: "death", date: person.death, place: person.deathPlace, age });
    }
    const place = person.deathPlace;
    if (deathDate && place && age !== null) {
      sentences.push({ key: "diedDatePlaceAge", params: { date: deathDate, place, age } });
    } else if (deathDate && place) {
      sentences.push({ key: "diedDatePlace", params: { date: deathDate, place } });
    } else if (deathDate && age !== null) {
      sentences.push({ key: "diedDateAge", params: { date: deathDate, age } });
    } else if (deathDate) {
      sentences.push({ key: "diedDate", params: { date: deathDate } });
    } else if (place) {
      sentences.push({ key: "diedPlace", params: { place } });
    }
  }

  return { milestones, sentences };
}
