import {
  calculateAge,
  formatLifespan,
  formatPersonName,
  resolveHistoricalDate,
  type Gender,
} from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
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
import type { TFunction } from "i18next";
import { Network, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage, type SupportedLanguage } from "../../i18n/create-i18n-instance";
import { publicBackendUrl } from "../../lib/env";
import { formatDisplayDate } from "../../lib/format-date";
import {
  avatarColorClass,
  GenderIcon,
  initials,
  labelFor,
  genderLabel,
} from "../../lib/person-display";
import { createPerson, listPersons, removePerson } from "../../server/functions/person.functions";
import { listOptions } from "../../server/functions/settings.functions";
import { historicalDatePreview } from "./-shared";

export const Route = createFileRoute("/people/")({
  component: People,
});

type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];
type ConfigurableOptionRow = Awaited<ReturnType<typeof listOptions>>[number];
// Mirrors apps/backend/src/person/person.router.ts's local `listInput`.
type SortOption = "surname_asc" | "given_asc" | "birth_asc" | "birth_desc";

function sortLabels(t: TFunction): Record<SortOption, string> {
  return {
    surname_asc: t("people.sort.surnameAsc"),
    given_asc: t("people.sort.givenAsc"),
    birth_asc: t("people.sort.birthAsc"),
    birth_desc: t("people.sort.birthDesc"),
  };
}

// `features`/`helper` have no dependency on fetched data and stay module
// scope; `columns` itself is built inside the component (see its `useMemo`)
// since the Sources column needs `options` (confidence labels) on hand.
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, PersonListItem>();

const PAGE_SIZE = 50;

function People() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [place, setPlace] = useState("");
  const [bornAfter, setBornAfter] = useState("");
  const [bornBefore, setBornBefore] = useState("");
  const [gender, setGender] = useState<"all" | Gender>("all");
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
    resetToFirstPage();
  };

  // Each field is a single boundary date, not a fuzzy one — "born after
  // 1900" resolves to the earliest possible day compatible with whatever was
  // typed/picked, "born before 1900" to the latest, so a bare year still
  // filters sensibly instead of requiring an exact day.
  const language = toSupportedLanguage(i18n.language);
  const bornAfterIso =
    bornAfter.trim() === "" ? null : resolveHistoricalDate(bornAfter, language).earliest;
  const bornBeforeIso =
    bornBefore.trim() === "" ? null : resolveHistoricalDate(bornBefore, language).latest;

  const listInput = {
    limit: PAGE_SIZE,
    offset,
    search: search.trim() === "" ? null : search.trim(),
    gender: gender === "all" ? null : gender,
    place: place.trim() === "" ? null : place.trim(),
    bornAfter: bornAfterIso,
    bornBefore: bornBeforeIso,
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

  const columns = useMemo(
    () => buildColumns(options.data ?? EMPTY_OPTIONS, t, language),
    [options.data, t, language],
  );

  // The table needs a stable array; an inline `?? []` would be a new one each render.
  const rows = people.data?.items ?? EMPTY_ROWS;
  const table = useTable({ features, columns, data: rows });
  const total = people.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t("people.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {people.data
              ? t("people.countInTree", { count: people.data.total })
              : t("common.loading")}
          </p>
        </div>
        <Button
          isDisabled={createPersonMutation.isPending}
          onPress={() => createPersonMutation.mutate({ data: {} })}
        >
          {createPersonMutation.isPending ? t("people.adding") : t("people.addPerson")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <SectionCard
          className="h-fit"
          title={t("common.filters")}
          titleClassName="text-base"
          contentClassName="space-y-4"
          action={
            <Button type="button" variant="ghost" size="sm" onPress={resetFilters}>
              {t("common.reset")}
            </Button>
          }
        >
          <LabeledField label={t("people.filterPlace")} asDiv>
            <Input
              value={place}
              onChange={(event) => {
                setPlace(event.target.value);
                resetToFirstPage();
              }}
              aria-label={t("people.filterPlace")}
            />
          </LabeledField>

          <LabeledField label={t("people.bornAfter")} asDiv>
            <HistoricalDateInput
              aria-label={t("people.bornAfter")}
              value={bornAfter}
              onChange={(value) => {
                setBornAfter(value);
                resetToFirstPage();
              }}
              preview={historicalDatePreview(bornAfter, language)}
            />
          </LabeledField>

          <LabeledField label={t("people.bornBefore")} asDiv>
            <HistoricalDateInput
              aria-label={t("people.bornBefore")}
              value={bornBefore}
              onChange={(value) => {
                setBornBefore(value);
                resetToFirstPage();
              }}
              preview={historicalDatePreview(bornBefore, language)}
            />
          </LabeledField>

          <LabeledField label={t("common.gender.label")} asDiv>
            <ButtonRadioGroup
              aria-label={t("people.filterGender")}
              value={gender}
              onChange={(value) => {
                setGender(value);
                resetToFirstPage();
              }}
              options={[
                { value: "all", label: t("people.genderAll") },
                { value: "M", label: t("common.gender.M") },
                { value: "F", label: t("common.gender.F") },
              ]}
            />
          </LabeledField>
        </SectionCard>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Input
                className="max-w-xs"
                placeholder={t("people.searchByName")}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetToFirstPage();
                }}
                aria-label={t("people.searchByName")}
              />
              <Select
                aria-label={t("people.sortLabel")}
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
                  {Object.entries(sortLabels(t)).map(([value, label]) => (
                    <SelectItem key={value} id={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {people.isError && (
              <p className="text-sm text-destructive">
                {t("people.loadError", { message: people.error.message })}
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              {t("people.showingCount", { shown: rows.length, total })}
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
                      {t("people.noMatches")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>{t("people.pageOf", { page: page + 1, totalPages })}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={page === 0}
                  onPress={() => setPage((current) => current - 1)}
                >
                  {t("people.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={offset + PAGE_SIZE >= total}
                  onPress={() => setPage((current) => current + 1)}
                >
                  {t("people.next")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function buildColumns(options: ConfigurableOptionRow[], t: TFunction, language: SupportedLanguage) {
  const dash = "—";
  return helper.columns([
    helper.accessor((row) => formatPersonName(row), {
      id: "name",
      header: t("people.columnPerson"),
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
      header: t("common.gender.label"),
      cell: (context) => (
        <span className="flex items-center gap-1.5">
          <GenderIcon gender={context.getValue()} className="size-4" />
          {genderLabel(context.getValue(), t)}
        </span>
      ),
    }),
    helper.accessor("isLiving", {
      id: "status",
      header: t("people.columnStatus"),
      cell: (context) => (
        <Badge variant={context.getValue() ? "secondary" : "outline"}>
          {context.getValue() ? t("people.living") : t("people.deceased")}
        </Badge>
      ),
    }),
    helper.accessor((row) => calculateAge(row), {
      id: "age",
      header: t("people.columnAge"),
      cell: (context) => context.getValue() ?? dash,
    }),
    helper.accessor((row) => formatLifespan(row) ?? dash, {
      id: "lifespan",
      header: t("people.columnLifespan"),
    }),
    helper.accessor((row) => formatDisplayDate(row.birth, language) ?? dash, {
      id: "born",
      header: t("people.columnBorn"),
    }),
    helper.accessor(
      (row) => (row.isLiving ? dash : (formatDisplayDate(row.death, language) ?? dash)),
      {
        id: "died",
        header: t("people.columnDied"),
      },
    ),
    helper.accessor((row) => row.birthPlace ?? row.deathPlace ?? dash, {
      id: "place",
      header: t("common.place"),
    }),
    helper.display({
      id: "parents",
      header: t("people.columnParents"),
      cell: (context) => {
        const parents = context.row.original.parents;
        if (parents.length === 0) return dash;
        return parents.map((parent) => `${parent.given} ${parent.surname}`.trim()).join(", ");
      },
    }),
    helper.display({
      id: "sources",
      header: t("people.columnSources"),
      cell: (context) => {
        const { citationCount, topConfidence } = context.row.original;
        if (citationCount === 0) {
          return (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
              {t("people.unsourced")}
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
      header: t("people.columnId"),
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
  const { t } = useTranslation();
  return (
    <Link
      to="/tree"
      search={{ personId: person.id }}
      className={buttonVariants({ variant: "ghost", size: "icon" })}
      aria-label={t("people.viewInTree", { name: formatPersonName(person) })}
    >
      <Network className="size-4 text-muted-foreground" />
    </Link>
  );
}

/** Hidden outright when `hasRelations` is set — the backend enforces the same rule in `remove`. */
function DeletePersonAction({ person }: { person: PersonListItem }) {
  const { t } = useTranslation();
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
        title={t("people.deleteTitle", { name: formatPersonName(person) })}
        description={t("people.deleteDescription")}
        actionLabel={t("common.delete")}
        onConfirm={() => removePersonMutation.mutate({ data: { id: person.id } })}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("people.deleteAriaLabel", { name: formatPersonName(person) })}
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
