import { SectionCard } from "@genealogy/ui/components/section-card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getHealth } from "../server/functions/health.functions";
import { listPersons } from "../server/functions/person.functions";

export const Route = createFileRoute("/")({
  component: Overview,
});

function Overview() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ["health"], queryFn: () => getHealth() });
  const people = useQuery({
    queryKey: ["person", "list", { limit: 1, offset: 0, search: null }],
    queryFn: () => listPersons({ data: { limit: 1, offset: 0, search: null } }),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SectionCard
        title={t("overview.backendTitle")}
        description={t("overview.backendDescription")}
      >
        {health.isPending && (
          <p className="text-sm text-muted-foreground">{t("overview.checking")}</p>
        )}
        {health.isError && (
          <p className="text-sm text-destructive">
            {t("overview.unreachable", { message: health.error.message })}
          </p>
        )}
        {health.data && (
          <p className="text-sm">
            {t("overview.checkedAt", {
              status: health.data.status,
              time: health.data.checkedAt.toLocaleTimeString(),
            })}
          </p>
        )}
      </SectionCard>

      <SectionCard title={t("overview.peopleTitle")} description={t("overview.peopleDescription")}>
        <p className="text-3xl font-semibold tabular-nums">
          {people.isPending ? "—" : (people.data?.total ?? 0)}
        </p>
      </SectionCard>
    </div>
  );
}
