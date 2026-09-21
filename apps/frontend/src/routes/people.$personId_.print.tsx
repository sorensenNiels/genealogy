import type { AppRouter } from "@genealogy/backend";
import { formatAge, formatFullPersonName, formatLifespan, formatPersonName } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";

import { useTRPC } from "../lib/trpc";

export const Route = createFileRoute("/people/$personId_/print")({
  component: PrintRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PersonRow = RouterOutputs["person"]["byId"];
type UnionRow = RouterOutputs["person"]["listUnions"][number];

function PrintRoute() {
  const { personId } = Route.useParams();
  const trpc = useTRPC();

  const person = useQuery(trpc.person.byId.queryOptions({ id: personId }));
  const relatives = useQuery(trpc.person.relatives.queryOptions({ id: personId }));
  const names = useQuery(trpc.person.listNames.queryOptions({ personId }));
  const events = useQuery(trpc.person.listEvents.queryOptions({ personId }));
  const unions = useQuery(trpc.person.listUnions.queryOptions({ personId }));
  const citationsList = useQuery(trpc.source.listCitations.queryOptions({ personId }));
  const sourcesList = useQuery(trpc.source.listSources.queryOptions());

  if (person.isPending) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (person.isError) {
    return <p className="text-destructive">Could not load person: {person.error.message}</p>;
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
          ← Back to record
        </Link>
        <Button onPress={() => window.print()}>Print</Button>
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
          <h2 className="mb-2 font-semibold">Vitals</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Sex</dt>
            <dd>{record.sex}</dd>
            <dt className="text-muted-foreground">Born</dt>
            <dd>
              {record.birth?.original ?? "—"}
              {record.birthPlace ? ` in ${record.birthPlace}` : ""}
            </dd>
            <dt className="text-muted-foreground">Died</dt>
            <dd>
              {record.isLiving ? "Living" : (record.death?.original ?? "—")}
              {record.deathPlace ? ` in ${record.deathPlace}` : ""}
            </dd>
            {record.notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd>{record.notes}</dd>
              </>
            )}
          </dl>
        </section>

        {names.data && names.data.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">Alternate names</h2>
            <ul className="space-y-1 text-sm">
              {names.data.map((name) => (
                <li key={name.id}>
                  <span className="text-muted-foreground">{name.nameType}:</span>{" "}
                  {[name.given, name.surname].filter(Boolean).join(" ")}
                  {name.notes ? ` — ${name.notes}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-semibold">Immediate family</h2>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <FamilyList title="Parents" people={parents} />
            <FamilyList title="Spouses" people={spouses} unionFor={unionFor} />
            <FamilyList title="Children" people={children} />
          </div>
        </section>

        {events.data && events.data.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">Life events</h2>
            <ul className="space-y-1 text-sm">
              {events.data.map((event) => (
                <li key={event.id}>
                  <span className="text-muted-foreground">
                    {event.eventType}
                    {event.label ? ` (${event.label})` : ""}:
                  </span>{" "}
                  {event.date?.original}
                  {event.place ? ` in ${event.place}` : ""}
                  {event.description ? ` — ${event.description}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {citationsList.data && citationsList.data.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">Sources</h2>
            <ul className="space-y-1 text-sm">
              {citationsList.data.map((citation) => {
                const source = sourceById.get(citation.sourceId);
                return (
                  <li key={citation.id}>
                    {source?.title ?? "Unknown source"}
                    {citation.page ? `, p. ${citation.page}` : ""}{" "}
                    <span className="text-muted-foreground">({citation.confidence})</span>
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
}: {
  title: string;
  people: PersonRow[];
  unionFor?: (id: string) => UnionRow | undefined;
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {people.length === 0 ? (
        <p className="text-muted-foreground">None recorded.</p>
      ) : (
        <ul className="space-y-0.5">
          {people.map((person) => {
            const union = unionFor?.(person.id);
            return (
              <li key={person.id}>
                {formatPersonName(person)}
                {formatLifespan(person) ? ` (${formatLifespan(person)})` : ""}
                {union ? ` — ${union.status}` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
