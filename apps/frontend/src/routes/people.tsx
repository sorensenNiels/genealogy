import type { AppRouter } from "@genealogy/backend";
import { formatLifespan, formatPersonName } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { Input } from "@genealogy/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@genealogy/ui/components/table";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";

import { useTRPC } from "../lib/trpc";

export const Route = createFileRoute("/people")({
  component: People,
});

type PersonListItem = inferRouterOutputs<AppRouter>["person"]["list"]["items"][number];

// Declared at module scope: the table treats these as stable identities and
// rebuilds its models whenever they change.
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, PersonListItem>();
const columns = helper.columns([
  helper.accessor((row) => formatPersonName(row), { id: "name", header: "Name" }),
  helper.accessor("sex", { id: "sex", header: "Sex" }),
  helper.accessor((row) => formatLifespan(row) ?? "—", { id: "lifespan", header: "Lifespan" }),
  helper.accessor((row) => row.birthPlace ?? "—", { id: "birthPlace", header: "Born in" }),
]);

const PAGE_SIZE = 50;

function People() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const people = useQuery(
    trpc.person.list.queryOptions({
      limit: PAGE_SIZE,
      offset: 0,
      search: search.trim() === "" ? null : search.trim(),
    }),
  );

  const createPerson = useMutation(
    trpc.person.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.person.list.queryKey() });
      },
    }),
  );

  const form = useForm({
    defaultValues: { given: "", surname: "" },
    onSubmit: async ({ value, formApi }) => {
      await createPerson.mutateAsync(value);
      formApi.reset();
    },
  });

  // The table needs a stable array; an inline `?? []` would be a new one each render.
  const rows = people.data?.items ?? EMPTY_ROWS;
  const table = useTable({ features, columns, data: rows });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-sm text-muted-foreground">
            {people.data ? `${people.data.total} recorded` : "Loading…"}
          </p>
        </div>
        <Input
          className="max-w-xs"
          placeholder="Search by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search people by name"
        />
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="given">
          {(field) => (
            <Input
              className="max-w-40"
              placeholder="Given names"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-label="Given names"
            />
          )}
        </form.Field>
        <form.Field name="surname">
          {(field) => (
            <Input
              className="max-w-40"
              placeholder="Surname"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-label="Surname"
            />
          )}
        </form.Field>
        <Button type="submit" disabled={createPerson.isPending}>
          {createPerson.isPending ? "Adding…" : "Add person"}
        </Button>
      </form>

      {people.isError && (
        <p className="text-sm text-destructive">Could not load people: {people.error.message}</p>
      )}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 && !people.isPending && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-muted-foreground"
              >
                No one here yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const EMPTY_ROWS: PersonListItem[] = [];
