import { SectionCard } from "@genealogy/ui/components/section-card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { getHealth } from "../server/functions/health.functions";
import { listPersons } from "../server/functions/person.functions";

export const Route = createFileRoute("/")({
  component: Overview,
});

function Overview() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => getHealth() });
  const people = useQuery({
    queryKey: ["person", "list", { limit: 1, offset: 0, search: null }],
    queryFn: () => listPersons({ data: { limit: 1, offset: 0, search: null } }),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SectionCard
        title="Backend"
        description="NestJS over tRPC, talking to Postgres and Apache AGE."
      >
        {health.isPending && <p className="text-sm text-muted-foreground">Checking…</p>}
        {health.isError && (
          <p className="text-sm text-destructive">Unreachable: {health.error.message}</p>
        )}
        {health.data && (
          <p className="text-sm">
            {health.data.status} — checked at {health.data.checkedAt.toLocaleTimeString()}
          </p>
        )}
      </SectionCard>

      <SectionCard title="People" description="Individuals recorded in this tree.">
        <p className="text-3xl font-semibold tabular-nums">
          {people.isPending ? "—" : (people.data?.total ?? 0)}
        </p>
      </SectionCard>
    </div>
  );
}
