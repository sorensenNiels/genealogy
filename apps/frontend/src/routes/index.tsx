import { Button } from "@genealogy/ui/components/button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  immichStatusQueryKey,
  immichUnavailableMessage,
  useImmichStatus,
} from "../lib/immich-status";
import { getHealth } from "../server/functions/health.functions";
import { getImmichStatus } from "../server/functions/immich.functions";
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

      <ImmichCard />
    </div>
  );
}

/**
 * Immich runs on its own server and is optional — this is where to see
 * whether photos and albums are on, and why not if they aren't.
 */
function ImmichCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useImmichStatus();
  // Bypasses the backend's 30s probe cache, then seeds the shared query so
  // the nav link and every other gate pick up the new answer immediately.
  const recheck = useMutation({
    mutationFn: () => getImmichStatus({ data: { refresh: true } }),
    onSuccess: (fresh) => queryClient.setQueryData(immichStatusQueryKey, fresh),
  });

  return (
    <SectionCard
      title={t("overview.immichTitle")}
      description={t("overview.immichDescription")}
      action={
        <Button
          variant="outline"
          size="sm"
          isDisabled={status.isPending || recheck.isPending}
          onPress={() => recheck.mutate()}
        >
          {t("immich.checkAgain")}
        </Button>
      }
    >
      {status.isPending && (
        <p className="text-sm text-muted-foreground">{t("overview.checking")}</p>
      )}
      {status.isError && (
        <p className="text-sm text-destructive">
          {t("overview.unreachable", { message: status.error.message })}
        </p>
      )}
      {status.data && (
        <div className="space-y-1 text-sm">
          {status.data.available ? (
            <p>{t("immich.connected", { version: status.data.version ?? "" })}</p>
          ) : (
            <>
              <p className={status.data.configured ? "text-destructive" : undefined}>
                {immichUnavailableMessage(t, status.data)}
              </p>
              <p className="text-muted-foreground">{t("immich.featuresOff")}</p>
            </>
          )}
          <p className="text-muted-foreground">
            {t("immich.checkedAt", { time: status.data.checkedAt.toLocaleTimeString() })}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
