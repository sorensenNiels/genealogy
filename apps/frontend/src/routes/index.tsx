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
import { healthQuery, PERSON_COUNT_INPUT, personListQuery } from "../lib/queries";
import { getImmichStatus } from "../server/functions/immich.functions";

export const Route = createFileRoute("/")({
  // Prefetch what the page reads into the shared query cache, so it renders
  // with its data instead of a loading state — and with preload-on-intent
  // (router.tsx), usually before the link is even clicked. `prefetchQuery`,
  // not `ensureQueryData`: it never throws, so a failed request still lands
  // in the page's own inline error state rather than an error route.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.prefetchQuery(healthQuery()),
      queryClient.prefetchQuery(personListQuery(PERSON_COUNT_INPUT)),
    ]),
  component: Overview,
});

function Overview() {
  const { t } = useTranslation();
  const health = useQuery(healthQuery());
  const people = useQuery(personListQuery(PERSON_COUNT_INPUT));

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
          disabled={status.isPending || recheck.isPending}
          onClick={() => recheck.mutate()}
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
