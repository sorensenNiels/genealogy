import { formatFullPersonName } from "@genealogy/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { listAssociations } from "../../server/functions/association.functions";
import {
  getPersonById,
  getRelatives,
  listEvents,
  listNames,
  listUnions,
} from "../../server/functions/person.functions";
import { listNotes } from "../../server/functions/research-note.functions";
import { listOptions } from "../../server/functions/settings.functions";
import { listCitations, listSources } from "../../server/functions/source.functions";
import { AssociationsCard } from "./-associations-card";
import { BirthCard } from "./-birth-card";
import { CitationsSection } from "./-citations-section";
import { FamilyCard } from "./-family-card";
import { PersonPhotosCard } from "./-immich-photos-card";
import { LifeEventsCard } from "./-life-events-card";
import { LivingStatusDeathCard } from "./-living-status-death-card";
import { NamesGenderCard } from "./-names-gender-card";
import { PersonHeaderCard } from "./-person-header-card";
import { ResearchNotesSection } from "./-research-notes-section";

export const Route = createFileRoute("/people/$personId")({
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
  const navigate = useNavigate();

  const person = useQuery({
    queryKey: ["person", "byId", personId],
    queryFn: () => getPersonById({ data: { id: personId } }),
  });
  const relatives = useQuery({
    queryKey: ["person", "relatives", personId],
    queryFn: () => getRelatives({ data: { id: personId } }),
  });
  const names = useQuery({
    queryKey: ["person", "listNames", personId],
    queryFn: () => listNames({ data: { personId } }),
  });
  const events = useQuery({
    queryKey: ["person", "listEvents", personId],
    queryFn: () => listEvents({ data: { personId } }),
  });
  const unions = useQuery({
    queryKey: ["person", "listUnions", personId],
    queryFn: () => listUnions({ data: { personId } }),
  });
  const sourcesList = useQuery({
    queryKey: ["source", "listSources"],
    queryFn: () => listSources(),
  });
  const citationsList = useQuery({
    queryKey: ["source", "listCitations", personId],
    queryFn: () => listCitations({ data: { personId } }),
  });
  const researchNotesList = useQuery({
    queryKey: ["researchNote", "listNotes", personId],
    queryFn: () => listNotes({ data: { personId } }),
  });
  const associationsList = useQuery({
    queryKey: ["association", "list", personId],
    queryFn: () => listAssociations({ data: { personId } }),
  });
  const options = useQuery({ queryKey: ["settings", "listOptions"], queryFn: () => listOptions() });

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
    parents.length === 0 && spouses.length === 0 && children.length === 0 && unionRows.length === 0;

  return (
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
        hasParent={parents.length > 0}
        onChanged={refresh}
        canDelete={canDelete}
        onDeleted={() => navigate({ to: "/people" })}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <NamesGenderCard
            person={person.data}
            names={names.data ?? []}
            options={options.data ?? []}
            onChanged={refresh}
          />
          <BirthCard person={person.data} onChanged={refresh} />
          <LivingStatusDeathCard person={person.data} onChanged={refresh} />
          <PersonPhotosCard personId={personId} />
          <LifeEventsCard
            personId={personId}
            events={events.data ?? []}
            unions={unions.data ?? []}
            spouses={spouses}
            parents={parents}
            person={person.data}
            citations={citationsList.data ?? []}
            sourcesList={sourcesList.data ?? []}
            options={options.data ?? []}
            onChanged={refresh}
          />
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
      </div>
    </div>
  );
}
