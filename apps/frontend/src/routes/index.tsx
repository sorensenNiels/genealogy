import { formatLifespan, formatPersonName } from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NetworkIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { publicBackendUrl } from "../lib/env";
import {
  immichStatusQueryKey,
  immichUnavailableMessage,
  useImmichStatus,
} from "../lib/immich-status";
import { avatarColorClass, initials } from "../lib/person-display";
import {
  healthQuery,
  lastTreeQuery,
  myLineQuery,
  PERSON_COUNT_INPUT,
  personListQuery,
  recentPeopleQuery,
} from "../lib/queries";
import { getImmichStatus } from "../server/functions/immich.functions";
import type { getMyLine } from "../server/functions/overview.functions";

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
      queryClient.prefetchQuery(myLineQuery()),
      queryClient.prefetchQuery(lastTreeQuery()),
      queryClient.prefetchQuery(recentPeopleQuery()),
    ]),
  component: Overview,
});

function Overview() {
  const { t } = useTranslation();
  const health = useQuery(healthQuery());
  const people = useQuery(personListQuery(PERSON_COUNT_INPUT));

  return (
    // Full width (see `isFullWidthPath` in __root.tsx): more columns as the
    // window widens, so the cards don't stretch into long thin strips.
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      <YourPlaceCard />
      <ContinueCard />

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

type MyLine = NonNullable<Awaited<ReturnType<typeof getMyLine>>>;

/** A person as a small row: avatar, name and lifespan, linking to their page. */
function PersonChip({
  person,
  size = "sm",
}: {
  person: {
    id: string;
    given: string;
    surname: string;
    gender: "M" | "F" | "U";
    photoPath: string | null;
    birth: Parameters<typeof formatLifespan>[0]["birth"];
    death: Parameters<typeof formatLifespan>[0]["death"];
  };
  size?: "sm" | "lg";
}) {
  const { t } = useTranslation();
  const lifespan = formatLifespan(person);
  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className="flex min-w-0 items-center gap-3 rounded-md hover:underline"
    >
      <Avatar className={size === "lg" ? "size-14" : "size-8"}>
        {person.photoPath && (
          <AvatarImage src={`${publicBackendUrl}/uploads/${person.photoPath}`} alt="" />
        )}
        <AvatarFallback className={`text-xs ${avatarColorClass(person.gender)}`}>
          {initials(person)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className={size === "lg" ? "block text-lg font-semibold" : "block truncate text-sm"}>
          {formatPersonName(person) || t("tools.unnamed")}
        </span>
        {lifespan && <span className="block text-xs text-muted-foreground">{lifespan}</span>}
      </span>
    </Link>
  );
}

/**
 * "Your place in the tree": the member's own person (their "This is you"
 * on the profile), how far back their line is known, and a strip of
 * known-of-possible ancestors per generation — the quickest picture of
 * where research could go next. Without a linked person, the prompt to
 * choose one, since this and "My ancestors" depend on it.
 */
function YourPlaceCard() {
  const { t } = useTranslation();
  const line = useQuery(myLineQuery());
  return (
    <SectionCard title={t("overview.line.title")} description={t("overview.line.description")}>
      {line.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : line.isError ? (
        <p className="text-sm text-destructive">{line.error.message}</p>
      ) : line.data === null ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t("overview.line.notLinked")}</p>
          <Link
            to="/profile"
            search={{ section: "person" }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("overview.line.chooseYourself")}
          </Link>
        </div>
      ) : (
        <LineSummary line={line.data} />
      )}
    </SectionCard>
  );
}

function LineSummary({ line }: { line: MyLine }) {
  const { t } = useTranslation();
  const known = line.generations.reduce((total, row) => total + row.known, 0);
  const possible = line.generations.reduce((total, row) => total + row.possible, 0);
  return (
    <div className="space-y-4">
      <PersonChip person={line.person} size="lg" />
      <p className="text-sm">
        {t("overview.line.summary", {
          known,
          possible,
          generations: line.generations.length,
        })}{" "}
        <span className="text-muted-foreground">
          {line.furthest === 0
            ? t("overview.line.noParents")
            : t("overview.line.furthest", { count: line.furthest, total: line.totalAncestors })}
        </span>
      </p>
      <ul className="space-y-1.5" aria-label={t("overview.line.stripLabel")}>
        {line.generations.map((row) => (
          <li key={row.generation} className="grid grid-cols-[10rem_1fr_3.5rem] items-center gap-3">
            <span className="truncate text-xs text-muted-foreground">
              {t(`overview.line.generation.${row.generation}`)}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(row.known / row.possible) * 100}%` }}
              />
            </span>
            <span className="text-right text-xs tabular-nums">
              {t("overview.line.knownOf", { known: row.known, possible: row.possible })}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/tree"
          search={{ personId: line.person.id }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <NetworkIcon /> {t("overview.line.openTree")}
        </Link>
        <Link
          to="/people"
          search={{ ancestors: true }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <UsersIcon /> {t("overview.line.myAncestors")}
        </Link>
      </div>
    </div>
  );
}

/**
 * "Continue where you left off": the tree as the member last had it (its
 * centre, chart and direction — the same `lastTreeView` the tree reopens
 * with) and the people they opened most recently.
 */
function ContinueCard() {
  const { t } = useTranslation();
  const lastTree = useQuery(lastTreeQuery());
  const recent = useQuery(recentPeopleQuery());
  const nothingYet = lastTree.data === null && recent.data?.length === 0;
  return (
    <SectionCard
      title={t("overview.continue.title")}
      description={t("overview.continue.description")}
    >
      {lastTree.isPending || recent.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : lastTree.isError || recent.isError ? (
        <p className="text-sm text-destructive">{(lastTree.error ?? recent.error)?.message}</p>
      ) : nothingYet ? (
        <p className="text-sm text-muted-foreground">{t("overview.continue.empty")}</p>
      ) : (
        <div className="space-y-4">
          {lastTree.data && (
            <Link
              to="/tree"
              search={{
                personId: lastTree.data.person.id,
                view: lastTree.data.view,
                orientation: lastTree.data.orientation,
              }}
              className="flex items-center gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent"
            >
              <NetworkIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="block font-medium">{t("overview.continue.backToTree")}</span>
                <span className="block text-muted-foreground">
                  {t("overview.continue.treeAt", {
                    name: formatPersonName(lastTree.data.person) || t("tools.unnamed"),
                    chart: t(`tree.view.${lastTree.data.view}`),
                  })}
                </span>
              </span>
            </Link>
          )}
          {recent.data && recent.data.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("overview.continue.recentPeople")}</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {recent.data.map((person) => (
                  <li key={person.id}>
                    <PersonChip person={person} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
