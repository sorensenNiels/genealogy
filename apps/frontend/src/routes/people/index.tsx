import { calculateAge, formatLifespan, formatPersonName } from "@genealogy/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@genealogy/ui/components/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import { Input } from "@genealogy/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@genealogy/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Network, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { publicBackendUrl } from "../../lib/env";
import { GenderIcon, initials, SEX_LABELS } from "../../lib/person-display";
import { createPerson, listPersons, removePerson } from "../../server/functions/person.functions";

export const Route = createFileRoute("/people/")({
  component: People,
});

type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

// Declared at module scope: the table treats these as stable identities and
// rebuilds its models whenever they change.
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, PersonListItem>();
const columns = helper.columns([
  helper.accessor((row) => formatPersonName(row), {
    id: "name",
    header: "Person",
    cell: (context) => {
      const person = context.row.original;
      const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;
      return (
        <Link
          to="/people/$personId"
          params={{ personId: person.id }}
          className="flex items-center gap-2 hover:underline"
        >
          <Avatar className="size-8">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className="text-xs">{initials(person)}</AvatarFallback>
          </Avatar>
          {context.getValue()}
        </Link>
      );
    },
  }),
  helper.accessor("publicId", {
    id: "publicId",
    header: "ID",
    cell: (context) => <CopyableText value={context.getValue()} />,
  }),
  helper.accessor("sex", {
    id: "sex",
    header: "Gender",
    cell: (context) => (
      <span className="flex items-center gap-1.5">
        <GenderIcon sex={context.getValue()} className="size-4" />
        {SEX_LABELS[context.getValue()]}
      </span>
    ),
  }),
  helper.accessor("isLiving", {
    id: "status",
    header: "Status",
    cell: (context) => (
      <Badge variant={context.getValue() ? "secondary" : "outline"}>
        {context.getValue() ? "Living" : "Deceased"}
      </Badge>
    ),
  }),
  helper.accessor((row) => calculateAge(row), {
    id: "age",
    header: "Age",
    cell: (context) => context.getValue() ?? "—",
  }),
  helper.accessor((row) => formatLifespan(row) ?? "—", { id: "lifespan", header: "Lifespan" }),
  helper.accessor((row) => row.birthPlace ?? "—", { id: "birthPlace", header: "Born in" }),
  helper.display({
    id: "actions",
    header: "",
    cell: (context) => (
      <div className="flex items-center justify-end gap-1">
        <ViewInTreeAction person={context.row.original} />
        <DeletePersonAction person={context.row.original} />
      </div>
    ),
  }),
]);

const PAGE_SIZE = 50;

function People() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  const listInput = {
    limit: PAGE_SIZE,
    offset,
    search: search.trim() === "" ? null : search.trim(),
  };
  const people = useQuery({
    queryKey: ["person", "list", listInput],
    queryFn: () => listPersons({ data: listInput }),
  });

  // Creates a blank record (every field on CreatePerson defaults) and drops
  // straight onto its own page — the same "person ui" used for editing — to
  // fill in, rather than asking for a name up front in the list toolbar.
  const createPersonMutation = useMutation({
    mutationFn: createPerson,
    onSuccess: async (person) => {
      await queryClient.invalidateQueries({ queryKey: ["person", "list"] });
      await navigate({ to: "/people/$personId", params: { personId: person.id } });
    },
  });

  // The table needs a stable array; an inline `?? []` would be a new one each render.
  const rows = people.data?.items ?? EMPTY_ROWS;
  const table = useTable({ features, columns, data: rows });
  const total = people.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Person list</h1>
          <p className="text-sm text-muted-foreground">
            {people.data ? `${people.data.total} recorded` : "Loading…"}
          </p>
        </div>
        <Button
          isDisabled={createPersonMutation.isPending}
          onPress={() => createPersonMutation.mutate({ data: {} })}
        >
          {createPersonMutation.isPending ? "Adding…" : "Add person"}
        </Button>
      </div>

      <Input
        className="max-w-xs"
        placeholder="Search by name"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          // A filtered result set can have fewer pages than the last
          // unfiltered position — start over rather than strand the view.
          setPage(0);
        }}
        aria-label="Search people by name"
      />

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
            <TableRow key={row.id} className="group">
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={
                    cell.column.id === "actions"
                      ? "opacity-0 transition-opacity group-hover:opacity-100"
                      : undefined
                  }
                >
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

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              isDisabled={page === 0}
              onPress={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={offset + PAGE_SIZE >= total}
              onPress={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ViewInTreeAction({ person }: { person: PersonListItem }) {
  return (
    <Link
      to="/tree"
      search={{ personId: person.id }}
      className={buttonVariants({ variant: "ghost", size: "icon" })}
      aria-label={`View ${formatPersonName(person)} in tree`}
    >
      <Network className="size-4 text-muted-foreground" />
    </Link>
  );
}

/** Hidden outright when `hasRelations` is set — the backend enforces the same rule in `remove`. */
function DeletePersonAction({ person }: { person: PersonListItem }) {
  const queryClient = useQueryClient();
  const removePersonMutation = useMutation({
    mutationFn: removePerson,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["person", "list"] });
    },
  });

  if (person.hasRelations) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${formatPersonName(person)}`}
          isDisabled={removePersonMutation.isPending}
        >
          <Trash2Icon className="size-4 text-destructive" />
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {formatPersonName(person)}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes them and everything recorded about them — alternate names,
              life events, sources and citations. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onPress={() => removePersonMutation.mutate({ data: { id: person.id } })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {removePersonMutation.isError && (
        <p className="text-xs text-destructive">{removePersonMutation.error.message}</p>
      )}
    </div>
  );
}

const EMPTY_ROWS: PersonListItem[] = [];
