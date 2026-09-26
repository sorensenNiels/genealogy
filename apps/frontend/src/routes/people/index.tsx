import { calculateAge, formatLifespan, formatPersonName, type Gender } from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
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
import { useMemo, useState } from "react";

import { publicBackendUrl } from "../../lib/env";
import { formatDisplayDate } from "../../lib/format-date";
import {
  avatarColorClass,
  GenderIcon,
  initials,
  labelFor,
  GENDER_LABELS,
} from "../../lib/person-display";
import { createPerson, listPersons, removePerson } from "../../server/functions/person.functions";
import { listOptions } from "../../server/functions/settings.functions";

export const Route = createFileRoute("/people/")({
  component: People,
});

type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];
type ConfigurableOptionRow = Awaited<ReturnType<typeof listOptions>>[number];
// Mirrors apps/backend/src/person/person.router.ts's local `listInput`.
type SortOption = "surname_asc" | "given_asc" | "birth_asc" | "birth_desc";

const SORT_LABELS: Record<SortOption, string> = {
  surname_asc: "Surname A-Z",
  given_asc: "Given name A-Z",
  birth_asc: "Birth date (oldest first)",
  birth_desc: "Birth date (newest first)",
};

// `features`/`helper` have no dependency on fetched data and stay module
// scope; `columns` itself is built inside the component (see its `useMemo`)
// since the Sources column needs `options` (confidence labels) on hand.
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, PersonListItem>();

const PAGE_SIZE = 50;

function People() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [place, setPlace] = useState("");
  const [bornAfter, setBornAfter] = useState("");
  const [bornBefore, setBornBefore] = useState("");
  const [gender, setGender] = useState<"all" | Gender>("all");
  const [hasCitation, setHasCitation] = useState(false);
  const [missingBirthRecord, setMissingBirthRecord] = useState(false);
  const [hasOpenResearchNote, setHasOpenResearchNote] = useState(false);
  const [directAncestorsOnly, setDirectAncestorsOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("surname_asc");
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  // Every filter/sort control shares this — a changed filter can leave the
  // view stranded on a page that no longer exists, so each one resets to 0.
  const resetToFirstPage = () => setPage(0);

  const resetFilters = () => {
    setSearch("");
    setPlace("");
    setBornAfter("");
    setBornBefore("");
    setGender("all");
    setHasCitation(false);
    setMissingBirthRecord(false);
    setHasOpenResearchNote(false);
    setDirectAncestorsOnly(false);
    resetToFirstPage();
  };

  const listInput = {
    limit: PAGE_SIZE,
    offset,
    search: search.trim() === "" ? null : search.trim(),
    gender: gender === "all" ? null : gender,
    place: place.trim() === "" ? null : place.trim(),
    bornAfter: bornAfter.trim() === "" ? null : Number(bornAfter),
    bornBefore: bornBefore.trim() === "" ? null : Number(bornBefore),
    hasCitation,
    missingBirthRecord,
    hasOpenResearchNote,
    directAncestorsOnly,
    sort,
  };
  const people = useQuery({
    queryKey: ["person", "list", listInput],
    queryFn: () => listPersons({ data: listInput }),
  });
  const options = useQuery({ queryKey: ["settings", "listOptions"], queryFn: () => listOptions() });

  // Creates a blank record (every field on CreatePerson defaults) and drops
  // straight onto its own page — the same always-editable "person ui" used
  // for editing anyone else — to fill in, rather than asking for a name up
  // front in the list toolbar.
  const createPersonMutation = useMutation({
    mutationFn: createPerson,
    onSuccess: async (person) => {
      await queryClient.invalidateQueries({ queryKey: ["person", "list"] });
      await navigate({ to: "/people/$personId", params: { personId: person.id } });
    },
  });

  const columns = useMemo(() => buildColumns(options.data ?? EMPTY_OPTIONS), [options.data]);

  // The table needs a stable array; an inline `?? []` would be a new one each render.
  const rows = people.data?.items ?? EMPTY_ROWS;
  const table = useTable({ features, columns, data: rows });
  const total = people.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-sm text-muted-foreground">
            {people.data ? `${people.data.total} people in this tree` : "Loading…"}
          </p>
        </div>
        <Button
          isDisabled={createPersonMutation.isPending}
          onPress={() => createPersonMutation.mutate({ data: {} })}
        >
          {createPersonMutation.isPending ? "Adding…" : "Add person"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <SectionCard
          className="h-fit"
          title="Filters"
          titleClassName="text-base"
          contentClassName="space-y-4"
          action={
            <Button type="button" variant="ghost" size="sm" onPress={resetFilters}>
              Reset
            </Button>
          }
        >
          <LabeledField label="Birth or death place" asDiv>
            <Input
              value={place}
              onChange={(event) => {
                setPlace(event.target.value);
                resetToFirstPage();
              }}
              aria-label="Filter by birth or death place"
            />
          </LabeledField>

          <LabeledField label="Born between" asDiv>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                aria-label="Born after year"
                placeholder="From"
                value={bornAfter}
                onChange={(event) => {
                  setBornAfter(event.target.value);
                  resetToFirstPage();
                }}
              />
              <Input
                type="number"
                aria-label="Born before year"
                placeholder="To"
                value={bornBefore}
                onChange={(event) => {
                  setBornBefore(event.target.value);
                  resetToFirstPage();
                }}
              />
            </div>
          </LabeledField>

          <LabeledField label="Gender" asDiv>
            <ButtonRadioGroup
              aria-label="Filter by gender"
              value={gender}
              onChange={(value) => {
                setGender(value);
                resetToFirstPage();
              }}
              options={[
                { value: "all", label: "All" },
                { value: "M", label: "Male" },
                { value: "F", label: "Female" },
              ]}
              className="flex-wrap"
            />
          </LabeledField>

          <div className="space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">Research status</p>
            <Checkbox
              isSelected={hasCitation}
              onChange={(value) => {
                setHasCitation(value);
                resetToFirstPage();
              }}
            >
              Has primary source
            </Checkbox>
            <Checkbox
              isSelected={missingBirthRecord}
              onChange={(value) => {
                setMissingBirthRecord(value);
                resetToFirstPage();
              }}
            >
              Missing birth record
            </Checkbox>
            <Checkbox
              isSelected={hasOpenResearchNote}
              onChange={(value) => {
                setHasOpenResearchNote(value);
                resetToFirstPage();
              }}
            >
              Has open research notes
            </Checkbox>
            <Checkbox
              isSelected={directAncestorsOnly}
              onChange={(value) => {
                setDirectAncestorsOnly(value);
                resetToFirstPage();
              }}
            >
              Direct ancestors only
            </Checkbox>
          </div>
        </SectionCard>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Input
                className="max-w-xs"
                placeholder="Search by name"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetToFirstPage();
                }}
                aria-label="Search people by name"
              />
              <Select
                aria-label="Sort"
                value={sort}
                onChange={(value) => {
                  if (value) {
                    setSort(value as SortOption);
                    resetToFirstPage();
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} id={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {people.isError && (
              <p className="text-sm text-destructive">
                Could not load people: {people.error.message}
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              Showing {rows.length} of {total} people
            </p>

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
                      No one matches these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Page {page + 1} of {totalPages}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function buildColumns(options: ConfigurableOptionRow[]) {
  return helper.columns([
    helper.accessor((row) => formatPersonName(row), {
      id: "name",
      header: "Person",
      cell: (context) => {
        const person = context.row.original;
        const photoUrl = person.photoPath
          ? `${publicBackendUrl}/uploads/${person.photoPath}`
          : null;
        return (
          <Link
            to="/people/$personId"
            params={{ personId: person.id }}
            className="flex items-center gap-2 hover:underline"
          >
            <Avatar className="size-8">
              {photoUrl && <AvatarImage src={photoUrl} alt="" />}
              <AvatarFallback className={`text-xs ${avatarColorClass(person.gender)}`}>
                {initials(person)}
              </AvatarFallback>
            </Avatar>
            {context.getValue()}
          </Link>
        );
      },
    }),
    helper.accessor("gender", {
      id: "gender",
      header: "Gender",
      cell: (context) => (
        <span className="flex items-center gap-1.5">
          <GenderIcon gender={context.getValue()} className="size-4" />
          {GENDER_LABELS[context.getValue()]}
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
    helper.accessor((row) => formatDisplayDate(row.birth) ?? "—", {
      id: "born",
      header: "Born",
    }),
    helper.accessor((row) => (row.isLiving ? "—" : (formatDisplayDate(row.death) ?? "—")), {
      id: "died",
      header: "Died",
    }),
    helper.accessor((row) => row.birthPlace ?? row.deathPlace ?? "—", {
      id: "place",
      header: "Place",
    }),
    helper.display({
      id: "parents",
      header: "Parents",
      cell: (context) => {
        const parents = context.row.original.parents;
        if (parents.length === 0) return "—";
        return parents.map((parent) => `${parent.given} ${parent.surname}`.trim()).join(", ");
      },
    }),
    helper.display({
      id: "sources",
      header: "Sources",
      cell: (context) => {
        const { citationCount, topConfidence } = context.row.original;
        if (citationCount === 0) {
          return (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
              Unsourced
            </span>
          );
        }
        return (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            {citationCount} · {topConfidence ? labelFor(options, "confidence", topConfidence) : ""}
          </span>
        );
      },
    }),
    helper.accessor("publicId", {
      id: "publicId",
      header: "ID",
      cell: (context) => <CopyableText value={context.getValue()} />,
    }),
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
      <RemoveButton
        itemLabel={formatPersonName(person)}
        title={`Delete ${formatPersonName(person)}?`}
        description="This permanently removes them and everything recorded about them — alternate names, life events, sources and citations. This cannot be undone."
        actionLabel="Delete"
        onConfirm={() => removePersonMutation.mutate({ data: { id: person.id } })}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${formatPersonName(person)}`}
            isDisabled={removePersonMutation.isPending}
          >
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        }
      />
      {removePersonMutation.isError && (
        <p className="text-xs text-destructive">{removePersonMutation.error.message}</p>
      )}
    </div>
  );
}

const EMPTY_ROWS: PersonListItem[] = [];
const EMPTY_OPTIONS: ConfigurableOptionRow[] = [];
