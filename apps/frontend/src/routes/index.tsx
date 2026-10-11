import {
  overviewCardSchema,
  parseOverviewPreferences,
  visibleOverviewCards,
  type OverviewCard,
  type OverviewPreferences,
} from "@genealogy/core";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import { Popover } from "@genealogy/ui/components/popover";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { SortableGrid } from "@genealogy/ui/components/sortable-grid";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutGridIcon, MoveIcon, NetworkIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useOptimisticMutation } from "../lib/optimistic";
import { localToday, overviewCardLabel } from "../lib/overview-cards";
import { usePermissions } from "../lib/permissions";
import { usePersonName } from "../lib/person-name";
import {
  familyAtAGlanceQuery,
  featuredAncestorQuery,
  lastTreeQuery,
  myLineQuery,
  onThisDayQuery,
  overviewPreferencesQuery,
  overviewSettingsQuery,
  recentPeopleQuery,
  topPlacesQuery,
} from "../lib/queries";
import type { getMyLine } from "../server/functions/overview.functions";
import { saveOverviewPreferences } from "../server/functions/profile.functions";
import {
  FamilyAtAGlanceCard,
  FeaturedAncestorCard,
  OnThisDayCard,
  TopPlacesCard,
} from "./-overview-family-cards";
import {
  CensusGapsCard,
  RecentChangesCard,
  ResearchTodoCard,
  SystemCard,
  UpkeepCard,
} from "./-overview-research-cards";
import { PersonChip } from "./-person-chip";

export const Route = createFileRoute("/")({
  // Prefetch what the page reads into the shared query cache, so it renders
  // with its data instead of a loading state — and with preload-on-intent
  // (router.tsx), usually before the link is even clicked. `prefetchQuery`,
  // not `ensureQueryData`: it never throws, so a failed request still lands
  // in the page's own inline error state rather than an error route.
  // The quick family cards only: the research and upkeep cards read the
  // whole tree and would hold up the page, so they load on their own.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.prefetchQuery(overviewSettingsQuery()),
      queryClient.prefetchQuery(overviewPreferencesQuery()),
      queryClient.prefetchQuery(myLineQuery()),
      queryClient.prefetchQuery(lastTreeQuery()),
      queryClient.prefetchQuery(recentPeopleQuery()),
      queryClient.prefetchQuery(onThisDayQuery(localToday())),
      queryClient.prefetchQuery(featuredAncestorQuery(localToday())),
      queryClient.prefetchQuery(familyAtAGlanceQuery()),
      queryClient.prefetchQuery(topPlacesQuery()),
    ]),
  component: Overview,
});

/**
 * The landing page: the cards Settings → Overview shows, in its order, minus
 * any the member has hidden for themselves from "Customize" and any their
 * role isn't for (`OVERVIEW_CARD_ROLE`: research for editors, upkeep for
 * admins). The cards are independent — each fetches its own data — so
 * order and visibility are just which ones render. "Arrange" lets the
 * member drag them into their own order, saved on their profile.
 */
function Overview() {
  const { t } = useTranslation();
  const { role } = usePermissions();
  const settings = useQuery(overviewSettingsQuery());
  const preferences = useQuery(overviewPreferencesQuery());
  // "Arrange": the cards become draggable, inert tiles until "Done".
  const [arranging, setArranging] = useState(false);
  const savePreferences = useOptimisticMutation({
    mutationFn: saveOverviewPreferences,
    queryKey: overviewPreferencesQuery().queryKey,
    // The input's own type, where the server fills in defaults.
    update: (
      _previous: OverviewPreferences,
      variables: {
        data: {
          hiddenCards?: OverviewCard[] | undefined;
          cardOrder?: OverviewCard[] | undefined;
        };
      },
    ): OverviewPreferences => parseOverviewPreferences(variables.data),
  });

  const memberHidden = preferences.data?.hiddenCards ?? [];
  const memberOrder = preferences.data?.cardOrder;
  const site = settings.data ?? { cardOrder: [], hiddenCards: [] };
  const own = { hiddenCards: memberHidden, ...(memberOrder ? { cardOrder: memberOrder } : {}) };
  const cards = visibleOverviewCards(site, own, role);
  // What the site offers before this member hides any: what "Customize" lists.
  const offered = visibleOverviewCards(site, { ...own, hiddenCards: [] }, role);
  // A stable array for the drag grid, which resyncs whenever its items change.
  const cardKey = cards.join(",");
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const gridItems = useMemo(() => cards.map((card) => ({ id: card })), [cardKey]);

  // Until the settings load (they're prefetched, so rarely), nothing rather
  // than every card — a card the site hides shouldn't flash up first.
  if (!settings.data) return null;

  const save = (change: Partial<OverviewPreferences>) => {
    const next = { ...own, ...change };
    // `cardOrder: undefined` means "back to the site's order" — left out, not sent as null.
    if (next.cardOrder === undefined) delete next.cardOrder;
    savePreferences.mutate({ data: next });
  };

  return (
    <div className="space-y-4">
      {arranging ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
          <p className="text-sm text-muted-foreground">{t("overview.arrangeHelp")}</p>
          <div className="flex gap-2">
            {memberOrder && (
              <Button variant="ghost" size="sm" onClick={() => save({ cardOrder: undefined })}>
                {t("overview.arrangeReset")}
              </Button>
            )}
            <Button size="sm" onClick={() => setArranging(false)}>
              {t("overview.arrangeDone")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          {cards.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setArranging(true)}>
              <MoveIcon /> {t("overview.arrange")}
            </Button>
          )}
          <CustomizeOverview
            offered={offered}
            hidden={memberHidden}
            onChange={(hiddenCards) => save({ hiddenCards })}
          />
        </div>
      )}
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("overview.allHidden")}</p>
      ) : arranging ? (
        <SortableGrid
          aria-label={t("overview.arrangeLabel")}
          items={gridItems}
          textValue={(item) => overviewCardLabel(item.id, t)}
          dragLabel={(item) => t("overview.moveCard", { card: overviewCardLabel(item.id, t) })}
          // The dragged order first; hidden cards keep their places after it.
          onReorder={(ids) =>
            save({
              cardOrder: [
                ...new Set([...(ids as OverviewCard[]), ...(memberOrder ?? []), ...offered]),
              ],
            })
          }
          className="md:grid-cols-2 2xl:grid-cols-3"
        >
          {(item) => <OverviewCardView card={item.id} />}
        </SortableGrid>
      ) : (
        // Full width (see `isFullWidthPath` in __root.tsx): more columns as the
        // window widens, so the cards don't stretch into long thin strips.
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {cards.map((card) => (
            <OverviewCardView key={card} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function OverviewCardView({ card }: { card: OverviewCard }) {
  switch (card) {
    case "yourPlace":
      return <YourPlaceCard />;
    case "continue":
      return <ContinueCard />;
    case "onThisDay":
      return <OnThisDayCard />;
    case "featuredAncestor":
      return <FeaturedAncestorCard />;
    case "familyAtAGlance":
      return <FamilyAtAGlanceCard />;
    case "topPlaces":
      return <TopPlacesCard />;
    case "researchTodo":
      return <ResearchTodoCard />;
    case "censusGaps":
      return <CensusGapsCard />;
    case "recentChanges":
      return <RecentChangesCard />;
    case "thingsToLook":
      return <UpkeepCard />;
    case "system":
      return <SystemCard />;
  }
}

/**
 * A member's own choice of cards: a checkbox for each card the site shows,
 * saved on their profile at once. A card the site hides isn't offered —
 * that's Settings → Overview's call.
 */
function CustomizeOverview({
  offered,
  hidden,
  onChange,
}: {
  offered: OverviewCard[];
  hidden: OverviewCard[];
  onChange: (hidden: OverviewCard[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <Popover
      align="end"
      title={t("overview.customizeTitle")}
      trigger={
        <Button variant="outline" size="sm">
          <LayoutGridIcon /> {t("overview.customize")}
        </Button>
      }
    >
      <div className="space-y-2">
        {offered.map((card) => (
          <Checkbox
            key={card}
            className="flex"
            checked={!hidden.includes(card)}
            onCheckedChange={(checked) =>
              onChange(
                // Kept in the cards' own order, whatever order they're ticked in.
                overviewCardSchema.options.filter((option) =>
                  option === card ? !checked : hidden.includes(option),
                ),
              )
            }
          >
            {overviewCardLabel(card, t)}
          </Checkbox>
        ))}
        {hidden.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => onChange([])}>
            {t("overview.customizeReset")}
          </Button>
        )}
      </div>
    </Popover>
  );
}

type MyLine = NonNullable<Awaited<ReturnType<typeof getMyLine>>>;

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
  const { formatName } = usePersonName();
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
                    name: formatName(lastTree.data.person) || t("tools.unnamed"),
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
