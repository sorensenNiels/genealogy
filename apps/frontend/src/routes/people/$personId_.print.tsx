import type { AppRouter } from "@genealogy/backend";
import { formatAge, formatFullPersonName, formatLifespan, formatPersonName } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { labelFor } from "../../lib/person-display";
import {
  getPersonById,
  getRelatives,
  listEvents,
  listNames,
  listUnions,
} from "../../server/functions/person.functions";
import { listOptions } from "../../server/functions/settings.functions";
import { listCitations, listSources } from "../../server/functions/source.functions";

export const Route = createFileRoute("/people/$personId_/print")({
  component: PrintRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PersonRow = RouterOutputs["person"]["byId"];
type UnionRow = RouterOutputs["person"]["listUnions"][number];
type ConfigurableOptionRow = RouterOutputs["settings"]["listOptions"][number];

function PrintRoute() {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const { personId } = Route.useParams();

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
  const citationsList = useQuery({
    queryKey: ["source", "listCitations", personId],
    queryFn: () => listCitations({ data: { personId } }),
  });
  const sourcesList = useQuery({
    queryKey: ["source", "listSources"],
    queryFn: () => listSources(),
  });
  const options = useQuery({ queryKey: ["settings", "listOptions"], queryFn: () => listOptions() });

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

  const record = person.data;
  const parents = relatives.data?.parents ?? [];
  const spouses = relatives.data?.spouses ?? [];
  const children = relatives.data?.children ?? [];
  const unionsData = unions.data ?? [];
  const sourceById = new Map((sourcesList.data ?? []).map((source) => [source.id, source]));

  const unionFor = (relativeId: string): UnionRow | undefined =>
    unionsData.find(
      (union) =>
        (union.personAId === personId && union.personBId === relativeId) ||
        (union.personBId === personId && union.personAId === relativeId),
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/people/$personId"
          params={{ personId }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("person.print.backToRecord")}
        </Link>
        <Button onPress={() => window.print()}>{t("person.print.print")}</Button>
      </div>

      <div className="space-y-6">
        <header className="space-y-1 border-b pb-4">
          <h1 className="text-2xl font-semibold">{formatFullPersonName(record)}</h1>
          {(formatLifespan(record) ?? formatAge(record)) && (
            <p className="text-muted-foreground">
              {[formatLifespan(record), formatAge(record)].filter(Boolean).join(" · ")}
            </p>
          )}
        </header>

        <section>
          <h2 className="mb-2 font-semibold">{t("person.print.vitals")}</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("person.print.gender")}</dt>
            <dd>{record.gender}</dd>
            <dt className="text-muted-foreground">{t("person.print.born")}</dt>
            <dd>
              {formatDisplayDate(record.birth, language) ?? "—"}
              {record.birthPlace
                ? ` ${t("person.print.inPlace", { place: record.birthPlace })}`
                : ""}
            </dd>
            <dt className="text-muted-foreground">{t("person.print.died")}</dt>
            <dd>
              {record.isLiving
                ? t("person.livingStatusDeath.living")
                : (formatDisplayDate(record.death, language) ?? "—")}
              {record.deathPlace
                ? ` ${t("person.print.inPlace", { place: record.deathPlace })}`
                : ""}
            </dd>
            {record.notes && (
              <>
                <dt className="text-muted-foreground">{t("person.print.notes")}</dt>
                <dd>
                  <MarkdownContent>{record.notes}</MarkdownContent>
                </dd>
              </>
            )}
          </dl>
        </section>

        {names.data && names.data.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">{t("person.print.alternateNames")}</h2>
            <ul className="space-y-1 text-sm">
              {names.data.map((name) => (
                <li key={name.id}>
                  <span className="text-muted-foreground">
                    {labelFor(options.data ?? [], "name_variant_type", name.nameType)}:
                  </span>{" "}
                  {[name.given, name.surname].filter(Boolean).join(" ")}
                  {name.since
                    ? ` ${t("person.print.since", { date: formatDisplayDate(name.since, language) })}`
                    : ""}
                  {name.notes && <MarkdownContent className="mt-0.5">{name.notes}</MarkdownContent>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-semibold">{t("person.print.immediateFamily")}</h2>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <FamilyList
              title={t("person.print.parents")}
              people={parents}
              options={options.data ?? []}
              t={t}
            />
            <FamilyList
              title={t("person.print.spouses")}
              people={spouses}
              unionFor={unionFor}
              options={options.data ?? []}
              t={t}
            />
            <FamilyList
              title={t("person.print.children")}
              people={children}
              options={options.data ?? []}
              t={t}
            />
          </div>
        </section>

        {events.data && events.data.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">{t("person.print.lifeEvents")}</h2>
            <ul className="space-y-1 text-sm">
              {events.data.map((event) => (
                <li key={event.id}>
                  <span className="text-muted-foreground">
                    {labelFor(options.data ?? [], "event_type", event.eventType)}
                    {event.label ? ` (${event.label})` : ""}:
                  </span>{" "}
                  {formatDisplayDate(event.date, language)}
                  {event.place ? ` ${t("person.print.inPlace", { place: event.place })}` : ""}
                  {event.notes && (
                    <MarkdownContent className="mt-0.5">{event.notes}</MarkdownContent>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {citationsList.data && citationsList.data.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">{t("person.print.sources")}</h2>
            <ul className="space-y-1 text-sm">
              {citationsList.data.map((citation) => {
                const source = sourceById.get(citation.sourceId);
                return (
                  <li key={citation.id}>
                    {source?.title ?? t("person.events.unknownSource")}
                    {citation.page
                      ? `, ${t("person.events.page", { page: citation.page })}`
                      : ""}{" "}
                    <span className="text-muted-foreground">
                      ({labelFor(options.data ?? [], "confidence", citation.confidence)})
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function FamilyList({
  title,
  people,
  unionFor,
  options,
  t,
}: {
  title: string;
  people: PersonRow[];
  unionFor?: (id: string) => UnionRow | undefined;
  options: ConfigurableOptionRow[];
  t: TFunction;
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {people.length === 0 ? (
        <p className="text-muted-foreground">{t("person.print.noneRecorded")}</p>
      ) : (
        <ul className="space-y-0.5">
          {people.map((person) => {
            const union = unionFor?.(person.id);
            return (
              <li key={person.id}>
                {formatPersonName(person)}
                {formatLifespan(person) ? ` (${formatLifespan(person)})` : ""}
                {union ? ` — ${labelFor(options, "union_status", union.status)}` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
