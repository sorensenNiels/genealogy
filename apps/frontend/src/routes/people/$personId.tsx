import { formatFullPersonName } from "@genealogy/core";
import { ReadOnlyProvider } from "@genealogy/ui/lib/read-only";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { usePermissions } from "../../lib/permissions";
import { usePersonSettings } from "../../lib/person-settings";
import {
  associationsQuery,
  citationsQuery,
  eventsQuery,
  listOptionsQuery,
  namesQuery,
  personByIdQuery,
  prefetchPersonPage,
  relativesQuery,
  researchNotesQuery,
  sourcesQuery,
  unionsQuery,
} from "../../lib/queries";
import { AssociationsCard } from "./-associations-card";
import { CitationsSection } from "./-citations-section";
import { ExternalIdsCard } from "./-external-ids-card";
import { FamilyCard } from "./-family-card";
import { PersonPhotosCard } from "./-immich-photos-card";
import { LifeEventsCard } from "./-life-events-card";
import { PersonDetailsCard } from "./-person-details-card";
import { PersonHeaderCard } from "./-person-header-card";
import { RecordsCard } from "./-records-card";
import { ResearchNotesSection } from "./-research-notes-section";

export const Route = createFileRoute("/people/$personId")({
  // Prefetch what the page reads into the shared query cache, so it renders
  // with its data instead of a loading state — and with preload-on-intent
  // (router.tsx), usually before the link is even clicked. `prefetchQuery`,
  // not `ensureQueryData`: it never throws, so a failed request still lands
  // in the page's own inline error state rather than an error route.
  loader: ({ context: { queryClient }, params: { personId } }) =>
    prefetchPersonPage(queryClient, personId),
  component: PersonDetailRoute,
});

/**
 * The person-detail page: one full-width identity header, then everything
 * else in a two-column grid — a wide main column (Names & gender, Birth,
 * Living status & death, Photos, Life events, Sources & citations, Research
 * notes) and a narrower one holding the Family card. Each card owns its own
 * data-fetching, form state and mutations (see each `-*.tsx` file next to
 * this one); this file's only job is fetching the shared read models once
 * and wiring one `refresh` callback everything below can call after a write.
 */
function PersonDetailRoute() {
  const { t } = useTranslation();
  const { personId } = Route.useParams();
  const queryClient = useQueryClient();
  const { canEdit, isAdmin } = usePermissions();
  const personSettings = usePersonSettings();
  const navigate = useNavigate();

  const person = useQuery(personByIdQuery(personId));
  const relatives = useQuery(relativesQuery(personId));
  const names = useQuery(namesQuery(personId));
  const events = useQuery(eventsQuery(personId));
  const unions = useQuery(unionsQuery(personId));
  const sourcesList = useQuery(sourcesQuery());
  const citationsList = useQuery(citationsQuery(personId));
  const researchNotesList = useQuery(researchNotesQuery(personId));
  const associationsList = useQuery(associationsQuery(personId));
  const options = useQuery(listOptionsQuery());

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["person", "byId", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "relatives", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listTitlePrefixes"] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listSuffixes"] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listNames", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listEvents", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listUnions", personId] }),
      queryClient.invalidateQueries({ queryKey: ["source", "listSources"] }),
      queryClient.invalidateQueries({ queryKey: ["source", "listCitations", personId] }),
      queryClient.invalidateQueries({ queryKey: ["researchNote", "listNotes", personId] }),
      queryClient.invalidateQueries({ queryKey: ["association", "list", personId] }),
    ]);
  };

  if (person.isPending) {
    return <p className="text-muted-foreground">{t("person.detail.loading")}</p>;
  }
  if (person.isError) {
    return (
      <p className="text-destructive">
        {t("person.detail.loadError", { message: person.error.message })}
      </p>
    );
  }

  const parents = relatives.data?.parents ?? [];
  const spouses = relatives.data?.spouses ?? [];
  const children = relatives.data?.children ?? [];
  const siblings = relatives.data?.siblings ?? [];
  const unionRows = unions.data ?? [];
  const nicknames = (names.data ?? [])
    .filter((name) => name.nameType === "nickname")
    .map((name) => name.given);
  // Nobody already related (in any direction) should be offered again as a pick.
  const excludeIds = new Set([
    personId,
    ...parents.map((p) => p.id),
    ...spouses.map((p) => p.id),
    ...children.map((p) => p.id),
    ...siblings.map((p) => p.id),
  ]);
  // Mirrors the guard in PersonService.remove — a union can outlive the
  // SPOUSE_OF edge it came from (see unlinkSpouse), so it counts too.
  const canDelete =
    isAdmin &&
    parents.length === 0 &&
    spouses.length === 0 &&
    children.length === 0 &&
    unionRows.length === 0;

  // A Viewer sees the same page, read-only — every card's fields, Save,
  // Add and Remove follow `ReadOnlyProvider` (see packages/ui).
  return (
    <ReadOnlyProvider readOnly={!canEdit}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <nav
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
            aria-label={t("person.detail.breadcrumb")}
          >
            <Link to="/people" className="hover:text-foreground">
              {t("people.title")}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-foreground">
              {formatFullPersonName({ ...person.data, nickname: nicknames })}
            </span>
          </nav>
          <Link
            to="/people/$personId/print"
            params={{ personId }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("person.detail.printSummary")}
          </Link>
        </div>
        <PersonHeaderCard
          person={person.data}
          names={names.data ?? []}
          citations={citationsList.data ?? []}
          sourcesList={sourcesList.data ?? []}
          events={events.data ?? []}
          parentCount={parents.length}
          onChanged={refresh}
          canDelete={canDelete}
          onDeleted={() => navigate({ to: "/people" })}
        />
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <PersonDetailsCard
              person={person.data}
              names={names.data ?? []}
              unions={unions.data ?? []}
              spouses={spouses}
              childCount={children.length}
              options={options.data ?? []}
              onChanged={refresh}
            />
            <PersonPhotosCard personId={personId} />
            <LifeEventsCard
              personId={personId}
              events={events.data ?? []}
              unions={unions.data ?? []}
              spouses={spouses}
              parents={parents}
              personChildren={children}
              showFamilyEvents={personSettings.showFamilyEventsInTimeline}
              person={person.data}
              citations={citationsList.data ?? []}
              sourcesList={sourcesList.data ?? []}
              options={options.data ?? []}
              onChanged={refresh}
            />
            {/* A living person is name-only for a Viewer; their records are hidden too. */}
            {!person.data.redacted && (
              <RecordsCard person={person.data} options={options.data ?? []} onChanged={refresh} />
            )}
            <CitationsSection
              personId={personId}
              citations={citationsList.data ?? []}
              sourcesList={sourcesList.data ?? []}
              names={names.data ?? []}
              events={events.data ?? []}
              unions={unions.data ?? []}
              associations={associationsList.data?.own ?? []}
              options={options.data ?? []}
              onChanged={refresh}
            />
            <AssociationsCard
              personId={personId}
              own={associationsList.data?.own ?? []}
              appearances={associationsList.data?.appearances ?? []}
              events={events.data ?? []}
              unions={unions.data ?? []}
              spouses={spouses}
              options={options.data ?? []}
              onChanged={refresh}
            />
            <ResearchNotesSection
              personId={personId}
              notes={researchNotesList.data ?? []}
              options={options.data ?? []}
              onChanged={refresh}
            />
          </div>
          <div className="space-y-6">
            <FamilyCard
              personId={personId}
              parents={parents}
              spouses={spouses}
              childRelatives={children}
              siblings={siblings}
              excludeIds={excludeIds}
              options={options.data ?? []}
              unions={unions.data ?? []}
              onChanged={refresh}
            />
            <ExternalIdsCard personId={personId} />
          </div>
        </div>
      </div>
    </ReadOnlyProvider>
  );
}
