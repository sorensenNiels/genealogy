import { consistencyIssues, isBirthParentage } from "@genealogy/core";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConsistencyIssueText } from "../-consistency-issue";
import { usePersonSettings } from "../../lib/person-settings";
import type {
  ConfigurableOptionRow,
  ParentRow,
  PersonEventRow,
  PersonRow,
  RelativesResult,
  UnionRow,
} from "./-types";

/**
 * Facts on this page that can't all be true (`consistencyIssues`) — a
 * death before the birth, a mother aged 9 — checked against the person's
 * birth parents and birth children, under Settings → Person page's limits.
 * Editors only, and only when there's something to say: a Viewer can't fix
 * it, and doesn't see a living person's dates anyway.
 */
export function ConsistencyWarnings({
  person,
  events,
  unions,
  spouses,
  parents,
  personChildren,
  options,
}: {
  person: PersonRow;
  events: PersonEventRow[];
  unions: UnionRow[];
  spouses: PersonRow[];
  parents: ParentRow[];
  personChildren: RelativesResult["children"];
  options: ConfigurableOptionRow[];
}) {
  const { t } = useTranslation();
  const settings = usePersonSettings();
  const issues = consistencyIssues(
    {
      person,
      events,
      unions: unions
        .filter((union) => union.personAId === person.id || union.personBId === person.id)
        .map((union) => {
          const partnerId = union.personAId === person.id ? union.personBId : union.personAId;
          return {
            startDate: union.startDate,
            partner: spouses.find((spouse) => spouse.id === partnerId) ?? null,
          };
        }),
      parents: parents.filter((parent) => isBirthParentage(parent.parentage)),
      children: personChildren.filter((child) => isBirthParentage(child.parentage)),
    },
    settings,
  );
  if (issues.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlertIcon className="size-4 text-amber-600" aria-hidden="true" />
        {t("consistency.title", { count: issues.length })}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        {issues.map((issue, index) => (
          // Two warnings can be the same kind about the same relative only if
          // the data repeats itself; the index keeps the keys apart then.
          <li key={`${issue.kind}-${"relative" in issue ? issue.relative?.id : ""}-${index}`}>
            <ConsistencyIssueText issue={issue} options={options} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t("consistency.help")}</p>
    </div>
  );
}
