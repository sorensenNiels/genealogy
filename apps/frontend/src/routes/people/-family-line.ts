import { formatPersonName, type PeopleListSettings, yearOf } from "@genealogy/core";
import type { TFunction } from "i18next";

import type { listPersons } from "../../server/functions/person.functions";

type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

/**
 * A detailed People list row's family context: "Son of Jens Pedersen & Ane
 * Nielsdatter · ⚭ 1874 Maren Hansdatter" — the parents and spouses that
 * tell people with the same name apart. Each half only if Settings → People
 * list turns it on; null when there's nothing to say (or the list was
 * fetched without `withFamily`). "⚭" is the genealogical marriage sign, the
 * same as on the tree's marriage line, so it needs no translating.
 */
export function familyLine(
  person: PersonListItem,
  settings: Pick<PeopleListSettings, "detailParents" | "detailSpouses">,
  t: TFunction,
): string | null {
  if (!person.family) return null;
  const parts: string[] = [];
  const parents = person.family.parents.map((parent) => formatPersonName(parent)).filter(Boolean);
  if (settings.detailParents && parents.length > 0) {
    parts.push(t(`people.childOf.${person.gender}`, { parents: parents.join(" & ") }));
  }
  if (settings.detailSpouses) {
    for (const spouse of person.family.spouses) {
      const name = formatPersonName(spouse);
      if (!name) continue;
      const year = yearOf(spouse.married);
      parts.push(year ? `⚭ ${year} ${name}` : `⚭ ${name}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
