import type { ConsistencyIssue } from "@genealogy/core";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

import { labelFor } from "../lib/person-display";
import { usePersonName } from "../lib/person-name";
import type { ConfigurableOptionRow } from "./people/-types";

/**
 * One consistency warning in words — "Married Jens Pedersen at 9 at the
 * most." — with the relative it involves as a link to their page. Shared by
 * the person page's warnings and the Tools data-integrity report. The
 * sentences are written from the person's own point of view.
 */
export function ConsistencyIssueText({
  issue,
  options,
}: {
  issue: ConsistencyIssue;
  options: ConfigurableOptionRow[];
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const event =
    "eventType" in issue
      ? issue.eventType === "marriage"
        ? t("person.events.marriage")
        : labelFor(options, "event_type", issue.eventType)
      : "";
  const relative = "relative" in issue ? issue.relative : null;
  const key =
    issue.kind === "marriedTooYoung" && !relative
      ? "consistency.marriedTooYoungNoPartner"
      : `consistency.${issue.kind}`;
  return (
    <Trans
      i18nKey={key}
      values={{
        event,
        age: "age" in issue ? issue.age : undefined,
        name: relative ? formatName(relative) || t("tools.unnamed") : undefined,
      }}
      components={{
        person: relative ? (
          <Link
            to="/people/$personId"
            params={{ personId: relative.id }}
            className="font-medium underline-offset-2 hover:underline"
          />
        ) : (
          <span />
        ),
      }}
    />
  );
}
