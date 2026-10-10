import { personGroupKey, type PeopleListGrouping } from "@genealogy/core";
import type { TFunction } from "i18next";

import type { listPersons } from "../../server/functions/person.functions";

type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

export interface PeopleGroup {
  /** `personGroupKey`, or a marker for "none" — unique per group, for React keys and collapsing. */
  id: string;
  label: string;
  /** In the whole filtered list, not just this page. */
  count: number;
  people: PersonListItem[];
}

const NO_GROUP_KEY = "\u0000none";

/**
 * This page's rows under their group headers. The backend already ordered
 * them by group, so each group is one run of rows; the label is the group's
 * value as written by its first person (the key itself is lower case).
 */
export function groupPeople(
  rows: PersonListItem[],
  grouping: Exclude<PeopleListGrouping, "none">,
  counts: { key: string | null; count: number }[],
  t: TFunction,
): PeopleGroup[] {
  const groups: PeopleGroup[] = [];
  for (const person of rows) {
    const key = personGroupKey(person, grouping);
    const id = key ?? NO_GROUP_KEY;
    const last = groups.at(-1);
    if (last?.id === id) {
      last.people.push(person);
      continue;
    }
    groups.push({
      id,
      label: groupLabel(person, key, grouping, t),
      count: counts.find((entry) => entry.key === key)?.count ?? 0,
      people: [person],
    });
  }
  return groups.map((group) => ({
    ...group,
    count: Math.max(group.count, group.people.length),
  }));
}

function groupLabel(
  person: PersonListItem,
  key: string | null,
  grouping: Exclude<PeopleListGrouping, "none">,
  t: TFunction,
): string {
  if (key === null) return t(`people.groupNone.${grouping}`);
  switch (grouping) {
    case "surname":
      return person.surname.trim();
    case "century":
      return t("people.groupCentury", { year: Number(key) * 100 });
    case "birthplace":
      return (person.birthPlace ?? "").split(",")[0]!.trim();
  }
}
