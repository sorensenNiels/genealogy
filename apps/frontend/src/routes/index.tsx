import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@genealogy/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useTRPC } from "../lib/trpc";

export const Route = createFileRoute("/")({
  component: Overview,
});

function Overview() {
  const trpc = useTRPC();
  const health = useQuery(trpc.health.queryOptions());
  const people = useQuery(trpc.person.list.queryOptions({ limit: 1, offset: 0, search: null }));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Backend</CardTitle>
          <CardDescription>NestJS over tRPC, talking to Postgres and Apache AGE.</CardDescription>
        </CardHeader>
        <CardContent>
          {health.isPending && <p className="text-sm text-muted-foreground">Checking…</p>}
          {health.isError && (
            <p className="text-sm text-destructive">Unreachable: {health.error.message}</p>
          )}
          {health.data && (
            <p className="text-sm">
              {health.data.status} — checked at {health.data.checkedAt.toLocaleTimeString()}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>Individuals recorded in this tree.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums">
            {people.isPending ? "—" : (people.data?.total ?? 0)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
