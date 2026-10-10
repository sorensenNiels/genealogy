import {
  applyPeopleListPreferencesChange,
  calculateAge,
  defaultPeopleListSettings,
  formatLifespan,
  formatPersonName,
  peopleListColumnSchema,
  peopleListGroupingSchema,
  personListSortSchema,
  researchCheckKeySchema,
  resolveHistoricalDate,
  sortDirectionSchema,
  type PeopleListColumn,
  type PeopleListGrouping,
  type PeopleListPreferences,
  type PeopleListPreferencesChange,
  type PeopleListRowDetail,
  type PeopleListSettings,
  type PeopleListView,
  type PersonListSort,
  type ResearchCheckKey,
  type SortDirection,
  type TreeDateDetail,
  yearOf,
} from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { IconButton } from "@genealogy/ui/components/icon-button";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { Popover } from "@genealogy/ui/components/popover";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Select } from "@genealogy/ui/components/select";
import { Switch } from "@genealogy/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@genealogy/ui/components/table";
import { useUrlDraft } from "@genealogy/ui/hooks/use-url-draft";
import { cn } from "@genealogy/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  Columns3Icon,
  LayoutGrid,
  List,
  Network,
  Rows2Icon,
  Rows4Icon,
  Trash2Icon,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { toSupportedLanguage, type SupportedLanguage } from "../../i18n/create-i18n-instance";
import { publicBackendUrl } from "../../lib/env";
import { formatDisplayDate } from "../../lib/format-date";
import { useOptimisticMutation } from "../../lib/optimistic";
import { usePermissions } from "../../lib/permissions";
import {
  avatarColorClass,
  GenderIcon,
  initials,
  labelFor,
  genderLabel,
} from "../../lib/person-display";
import {
  listOptionsQuery,
  peopleListSettingsQuery,
  peopleListPreferencesQuery,
  personListQuery,
  type PersonListInput,
} from "../../lib/queries";
import type { listPersons } from "../../server/functions/person.functions";
import { createPerson, removePerson } from "../../server/functions/person.functions";
import { savePeopleListPreferences } from "../../server/functions/profile.functions";
import type { listOptions } from "../../server/functions/settings.functions";
import { familyLine } from "./-family-line";
import { PeopleCardView } from "./-people-card-view";
import { groupPeople, type PeopleGroup } from "./-people-groups";
import { historicalDatePreview } from "./-shared";

/**
 * The list's state, all in the URL: search, filters, sort and page survive
 * opening a person and coming Back, a reload, and a shared link. Each key
 * is left out at its default, so an unfiltered list is plain `/people`.
 * Dates stay as typed ("1850", "abt. 1850") and are resolved per request.
 */
interface PeopleSearch {
  q?: string;
  place?: string;
  bornAfter?: string;
  bornBefore?: string;
  gender?: "M" | "F";
  missing?: ResearchCheckKey;
  /** Only the signed-in member's own ancestors ("this is me" on their profile). */
  ancestors?: true;
  /** Only people with an unresolved research note — editors only, see `person.list`. */
  openNotes?: true;
  /** Name search also matches spellings that sound alike (Kristensen ~ Christensen). */
  similar?: true;
  /** Rows under a header per last name, century or parish; left out at the site's default. */
  group?: PeopleListGrouping;
  sort?: PersonListSort;
  dir?: SortDirection;
  /** 1-based; left out on the first page. */
  page?: number;
}

/** A change to the URL state; `undefined` takes a key back to its default. */
type PeopleSearchPatch = { [Key in keyof PeopleSearch]?: PeopleSearch[Key] | undefined };

const PEOPLE_SEARCH_FIELDS = {
  q: z.string().min(1),
  place: z.string().min(1),
  bornAfter: z.string().min(1),
  bornBefore: z.string().min(1),
  gender: z.enum(["M", "F"]),
  missing: researchCheckKeySchema,
  ancestors: z.literal(true),
  openNotes: z.literal(true),
  similar: z.literal(true),
  group: peopleListGroupingSchema,
  sort: personListSortSchema,
  dir: sortDirectionSchema,
  page: z.number().int().min(2),
} satisfies Record<keyof PeopleSearch, z.ZodType>;

/** Field by field, so one stale or hand-edited value is dropped rather than the whole search. */
function validatePeopleSearch(raw: Record<string, unknown>): PeopleSearch {
  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(PEOPLE_SEARCH_FIELDS)) {
    const field = schema.safeParse(raw[key]);
    if (field.success) result[key] = field.data;
  }
  return result as PeopleSearch;
}

const TABLE_PAGE_SIZE = 50;
const CARD_PAGE_SIZE = 24;

/** A typed field's value for the request: trimmed, and null when empty. */
function text(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

/**
 * The list request for a URL state — shared by the loader and the page so
 * the prefetched query and the page's own are the same key. Each born
 * field is a single boundary date, not a fuzzy one — "born after 1900"
 * resolves to the earliest day compatible with what was typed, "born
 * before 1900" to the latest, so a bare year still filters sensibly.
 */
function listInputFor(
  search: PeopleSearch,
  layout: ListLayout,
  settings: PeopleListSettings,
  language: SupportedLanguage,
): PersonListInput {
  const pageSize = pageSizeFor(layout.view);
  const bornAfter = text(search.bornAfter);
  const bornBefore = text(search.bornBefore);
  return {
    limit: pageSize,
    offset: ((search.page ?? 1) - 1) * pageSize,
    search: text(search.q),
    gender: search.gender ?? null,
    place: text(search.place),
    bornAfter: bornAfter ? resolveHistoricalDate(bornAfter, language).earliest : null,
    bornBefore: bornBefore ? resolveHistoricalDate(bornBefore, language).latest : null,
    missing: search.missing ?? null,
    directAncestorsOnly: search.ancestors ?? false,
    hasOpenResearchNote: search.openNotes ?? false,
    similarSpellings: search.similar ?? false,
    grouping: search.group ?? settings.defaultGrouping,
    sortBy: search.sort ?? settings.defaultSort,
    sortDir: search.dir ?? settings.defaultSortDirection,
    // Parents and spouses are only fetched when a detailed row will show them.
    withFamily:
      layout.rowDetail === "detailed" && (settings.detailParents || settings.detailSpouses),
  };
}

/** The larger cards get fewer to a page than the table's rows. */
function pageSizeFor(view: PeopleListView): number {
  return view === "card" ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
}

/** How the list is laid out for a member: table or cards, one line per person or two. */
interface ListLayout {
  view: PeopleListView;
  rowDetail: PeopleListRowDetail;
}

/**
 * The layout a member sees: their own last choices (saved on their profile,
 * so they follow them between devices), else the site's defaults.
 */
function layoutFor(
  preferences: PeopleListPreferences | undefined,
  settings: PeopleListSettings,
): ListLayout {
  return {
    view: preferences?.view ?? settings.defaultView,
    rowDetail: preferences?.rowDetail ?? settings.defaultRowDetail,
  };
}

export const Route = createFileRoute("/people/")({
  validateSearch: validatePeopleSearch,
  loaderDeps: ({ search }) => search,
  // Prefetch this page of the list (and the option labels it shows) into
  // the shared query cache — see the loader note in routes/index.tsx. The
  // site's list defaults and the member's own choices come first: they
  // decide the sort, page size and whether families are fetched, so the
  // prefetch is exactly the page's query and the first paint is already
  // the right layout.
  loader: async ({ context: { queryClient, language }, deps }) => {
    await Promise.all([
      queryClient.prefetchQuery(peopleListSettingsQuery()),
      queryClient.prefetchQuery(peopleListPreferencesQuery()),
      queryClient.prefetchQuery(listOptionsQuery()),
    ]);
    const settings =
      queryClient.getQueryData(peopleListSettingsQuery().queryKey) ?? defaultPeopleListSettings;
    const layout = layoutFor(
      queryClient.getQueryData(peopleListPreferencesQuery().queryKey),
      settings,
    );
    await queryClient.prefetchQuery(
      personListQuery(listInputFor(deps, layout, settings, language)),
    );
  },
  component: People,
});

type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];
type ConfigurableOptionRow = Awaited<ReturnType<typeof listOptions>>[number];

/** The table columns that sort the list when their header is clicked, and what by. */
const COLUMN_SORT: Partial<Record<string, PersonListSort>> = {
  name: "surname",
  age: "age",
  born: "birth",
  died: "death",
  place: "place",
};

/** Whether a column is the one the list is sorted by — the name column covers first-name order too. */
function isSortedBy(columnId: string, sortBy: PersonListSort): boolean {
  return COLUMN_SORT[columnId] === sortBy || (columnId === "name" && sortBy === "given");
}

interface SortState {
  sortBy: PersonListSort;
  dir: SortDirection;
  /** Sort by this column — the other direction if it already is. */
  onSort: (sortBy: PersonListSort) => void;
}

// `features`/`helper` have no dependency on fetched data and stay module
// scope; `columns` itself is built inside the component (see its `useMemo`)
// since the Sources column needs `options` (confidence labels) on hand.
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, PersonListItem>();

function People() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const language = toSupportedLanguage(i18n.language);

  const settings = useQuery(peopleListSettingsQuery()).data ?? defaultPeopleListSettings;
  const preferences = useQuery(peopleListPreferencesQuery());
  const layout = layoutFor(preferences.data, settings);
  const viewMode = layout.view;
  const detailed = layout.rowDetail === "detailed";
  const pageSize = pageSizeFor(viewMode);
  // A member's own choices are saved on their profile, applied at once (and
  // put back if the save fails).
  const savePreferenceMutation = useOptimisticMutation({
    mutationFn: savePeopleListPreferences,
    queryKey: peopleListPreferencesQuery().queryKey,
    update: (previous: PeopleListPreferences, variables: { data: PeopleListPreferencesChange }) =>
      applyPeopleListPreferencesChange(previous, variables.data),
  });
  const page = search.page ?? 1;
  const grouping = search.group ?? settings.defaultGrouping;
  // The member's own column choice, else the site's — a Set so the columns
  // memo below only reruns when the choice itself changes.
  const columnChoice = preferences.data?.columns ?? settings.defaultColumns;
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const visibleColumns = useMemo(() => new Set<string>(columnChoice), [columnChoice.join(",")]);

  /**
   * Changes the URL state. Any change but paging goes back to the first
   * page — a changed filter can leave the view stranded on a page that no
   * longer exists — and replaces the history entry, so Back leaves the list
   * rather than stepping through each filter. Paging adds an entry.
   */
  const update = (patch: PeopleSearchPatch, paging = false) =>
    void navigate({
      to: "/people",
      search: (previous) => {
        const next: Record<string, unknown> = { ...previous, ...patch };
        if (!paging) delete next.page;
        // Empty text and defaults aren't kept, so the URL stays short.
        for (const [key, value] of Object.entries(next)) {
          if (value === undefined || value === "" || value === false) delete next[key];
        }
        return next as PeopleSearch;
      },
      replace: !paging,
    });

  const [q, setQ] = useUrlDraft(search.q ?? "", (value) => update({ q: value }));
  const [place, setPlace] = useUrlDraft(search.place ?? "", (value) => update({ place: value }));
  const [bornAfter, setBornAfter] = useUrlDraft(search.bornAfter ?? "", (value) =>
    update({ bornAfter: value }),
  );
  const [bornBefore, setBornBefore] = useUrlDraft(search.bornBefore ?? "", (value) =>
    update({ bornBefore: value }),
  );

  // Reset clears what narrows the list; the sort and view stay as chosen.
  const resetFilters = () =>
    void navigate({
      to: "/people",
      search: (previous) => ({
        ...(previous.sort ? { sort: previous.sort } : {}),
        ...(previous.dir ? { dir: previous.dir } : {}),
      }),
      replace: true,
    });

  const sortBy = search.sort ?? settings.defaultSort;
  const sortDir = search.dir ?? settings.defaultSortDirection;
  const sortState: SortState = {
    sortBy,
    dir: sortDir,
    onSort: (field) => {
      // The name header sorts by last name — or, when the card view's menu
      // has chosen first names, keeps that and flips it.
      const target = field === "surname" && sortBy === "given" ? "given" : field;
      const dir = target === sortBy && sortDir === "asc" ? "desc" : "asc";
      // A value equal to the site's default is left out of the URL.
      update({
        sort: target === settings.defaultSort ? undefined : target,
        dir: dir === settings.defaultSortDirection ? undefined : dir,
      });
    },
  };

  const listInput = listInputFor(search, layout, settings, language);
  const people = useQuery({
    ...personListQuery(listInput),
    // Keep showing the current rows while the next page, sort or filter
    // loads, instead of emptying the table in between; they're dimmed
    // (`isPlaceholderData`) until the new ones arrive.
    placeholderData: keepPreviousData,
  });
  const options = useQuery(listOptionsQuery());

  // Creates a blank record (every field on CreatePerson defaults) and drops
  // straight onto its own page — the same always-editable "person ui" used
  // for editing anyone else — to fill in, rather than asking for a name up
  // front in the list toolbar.
  const { canEdit } = usePermissions();
  const createPersonMutation = useMutation({
    mutationFn: createPerson,
    onSuccess: async (person) => {
      await queryClient.invalidateQueries({ queryKey: ["person", "list"] });
      await navigate({ to: "/people/$personId", params: { personId: person.id } });
    },
  });

  const columns = useMemo(
    () =>
      buildColumns(options.data ?? EMPTY_OPTIONS, t, language, sortState, {
        dateDetail: settings.dateDetail,
        familyLine: detailed ? (person) => familyLine(person, settings, t) : null,
        placesUnderDates: detailed && settings.detailPlaces,
      }).filter(
        (column) => !column.id || !isChoosableColumn(column.id) || visibleColumns.has(column.id),
      ),
    // `sortState` is rebuilt every render; what it depends on is listed instead.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [options.data, t, language, sortBy, sortDir, settings, detailed, visibleColumns],
  );

  // The table needs a stable array; an inline `?? []` would be a new one each render.
  const rows = people.data?.items ?? EMPTY_ROWS;
  const table = useTable({ features, columns, data: rows });
  const total = people.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const groups =
    grouping === "none" ? null : groupPeople(rows, grouping, people.data?.groupCounts ?? [], t);
  // Collapsed groups, by key — for this visit only, like a folded outline.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const tableRows = table.getRowModel().rows;
  const rowsById = new Map(tableRows.map((row) => [row.original.id, row]));
  const renderRow = (row: (typeof tableRows)[number]) => (
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
  );

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
        {canEdit && (
          <Button
            disabled={createPersonMutation.isPending}
            onClick={() => createPersonMutation.mutate({ data: {} })}
          >
            {createPersonMutation.isPending ? t("people.adding") : t("people.addPerson")}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <SectionCard
          className="h-fit"
          title={t("common.filters")}
          titleClassName="text-base"
          contentClassName="space-y-4"
          action={
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              {t("common.reset")}
            </Button>
          }
        >
          <LabeledField label={t("people.filterPlace")} asDiv>
            <Input
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              aria-label={t("people.filterPlace")}
            />
          </LabeledField>

          <LabeledField label={t("people.bornAfter")} asDiv>
            <HistoricalDateInput
              aria-label={t("people.bornAfter")}
              value={bornAfter}
              onChange={setBornAfter}
              preview={historicalDatePreview(bornAfter, language)}
            />
          </LabeledField>

          <LabeledField label={t("people.bornBefore")} asDiv>
            <HistoricalDateInput
              aria-label={t("people.bornBefore")}
              value={bornBefore}
              onChange={setBornBefore}
              preview={historicalDatePreview(bornBefore, language)}
            />
          </LabeledField>

          <LabeledField label={t("people.filterMissing")} asDiv>
            <Select
              aria-label={t("people.filterMissing")}
              value={search.missing ?? "any"}
              onValueChange={(value) => update({ missing: value === "any" ? undefined : value })}
              options={[
                { value: "any" as const, label: t("people.missingAny") },
                ...researchCheckKeySchema.options.map((key) => ({
                  value: key,
                  label: t(`person.checklist.item.${key}`),
                })),
              ]}
            />
          </LabeledField>

          <ButtonRadioGroup
            aria-label={t("people.filterGender")}
            value={search.gender ?? "all"}
            onValueChange={(value) => update({ gender: value === "all" ? undefined : value })}
            options={[
              { value: "all" as const, label: t("people.genderAll") },
              { value: "M" as const, label: t("common.gender.M") },
              { value: "F" as const, label: t("common.gender.F") },
            ]}
          />

          <Switch
            checked={search.ancestors ?? false}
            onCheckedChange={(checked) => update({ ancestors: checked || undefined })}
            description={t("people.filterAncestorsHelp")}
          >
            {t("people.filterAncestors")}
          </Switch>

          {canEdit && (
            <Switch
              checked={search.openNotes ?? false}
              onCheckedChange={(checked) => update({ openNotes: checked || undefined })}
              description={t("people.filterOpenNotesHelp")}
            >
              {t("people.filterOpenNotes")}
            </Switch>
          )}
        </SectionCard>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  className="max-w-xs"
                  placeholder={t("people.searchByName")}
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  aria-label={t("people.searchByName")}
                />
                {/* Right by the box it changes, not in Settings: whether a
                    search should be strict or loose depends on the search. */}
                <span title={t("people.similarSpellingsHelp")}>
                  <Checkbox
                    checked={search.similar ?? false}
                    onCheckedChange={(checked) => update({ similar: checked || undefined })}
                  >
                    {t("people.similarSpellings")}
                  </Checkbox>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* The table sorts from its column headers; cards have none. */}
                {viewMode === "card" && (
                  <>
                    <Select
                      aria-label={t("people.sortLabel")}
                      value={sortBy}
                      onValueChange={(value) =>
                        update({ sort: value === settings.defaultSort ? undefined : value })
                      }
                      options={personListSortSchema.options.map((value) => ({
                        value,
                        label: t(`people.sortBy.${value}`),
                      }))}
                    />
                    <IconButton
                      variant="outline"
                      label={
                        sortDir === "asc" ? t("people.sortAscending") : t("people.sortDescending")
                      }
                      icon={sortDir === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
                      onClick={() => {
                        const dir = sortDir === "asc" ? "desc" : "asc";
                        update({ dir: dir === settings.defaultSortDirection ? undefined : dir });
                      }}
                    />
                  </>
                )}
                <Select
                  aria-label={t("people.groupLabel")}
                  value={grouping}
                  onValueChange={(value) =>
                    update({ group: value === settings.defaultGrouping ? undefined : value })
                  }
                  options={peopleListGroupingSchema.options.map((value) => ({
                    value,
                    label: t(`people.groupBy.${value}`),
                  }))}
                />
                {viewMode === "table" && (
                  <ColumnChooser
                    visible={visibleColumns}
                    // Place is under the dates in detailed rows, not a column to choose.
                    hidePlace={detailed && settings.detailPlaces}
                    isOwnChoice={preferences.data?.columns !== undefined}
                    onChange={(choice) =>
                      savePreferenceMutation.mutate({ data: { columns: choice } })
                    }
                  />
                )}
                <ButtonRadioGroup
                  aria-label={t("people.rowDetailLabel")}
                  value={layout.rowDetail}
                  onValueChange={(value) =>
                    savePreferenceMutation.mutate({ data: { rowDetail: value } })
                  }
                  options={[
                    {
                      value: "compact" as const,
                      label: (
                        <span className="flex items-center" title={t("people.rowCompact")}>
                          <Rows4Icon className="size-4" aria-hidden="true" />
                          <span className="sr-only">{t("people.rowCompact")}</span>
                        </span>
                      ),
                    },
                    {
                      value: "detailed" as const,
                      label: (
                        <span className="flex items-center" title={t("people.rowDetailed")}>
                          <Rows2Icon className="size-4" aria-hidden="true" />
                          <span className="sr-only">{t("people.rowDetailed")}</span>
                        </span>
                      ),
                    },
                  ]}
                />
                <ButtonRadioGroup
                  aria-label={t("people.viewModeLabel")}
                  value={viewMode}
                  onValueChange={(value) => {
                    savePreferenceMutation.mutate({ data: { view: value } });
                    // The page sizes differ, so the same page number would be other people.
                    update({});
                  }}
                  options={[
                    {
                      value: "table",
                      label: (
                        <span className="flex items-center" title={t("people.viewModeTable")}>
                          <List className="size-4" aria-hidden="true" />
                          <span className="sr-only">{t("people.viewModeTable")}</span>
                        </span>
                      ),
                    },
                    {
                      value: "card",
                      label: (
                        <span className="flex items-center" title={t("people.viewModeCard")}>
                          <LayoutGrid className="size-4" aria-hidden="true" />
                          <span className="sr-only">{t("people.viewModeCard")}</span>
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </div>

            {people.isError && (
              <p className="text-sm text-destructive">
                {t("people.loadError", { message: people.error.message })}
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              {t("people.showingCount", { shown: rows.length, total })}
            </p>

            <div
              aria-busy={people.isPlaceholderData}
              className={cn(
                "transition-opacity",
                people.isPlaceholderData && "opacity-60 delay-150",
              )}
            >
              {viewMode === "table" ? (
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            aria-sort={
                              isSortedBy(header.column.id, sortBy)
                                ? sortDir === "asc"
                                  ? "ascending"
                                  : "descending"
                                : undefined
                            }
                          >
                            {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {groups
                      ? groups.map((group) => (
                          <Fragment key={group.id}>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={columns.length} className="py-1.5">
                                <GroupHeader
                                  group={group}
                                  collapsed={collapsed.has(group.id)}
                                  onToggle={() => toggleGroup(group.id)}
                                />
                              </TableCell>
                            </TableRow>
                            {!collapsed.has(group.id) &&
                              group.people.flatMap((person) => {
                                const row = rowsById.get(person.id);
                                return row ? [renderRow(row)] : [];
                              })}
                          </Fragment>
                        ))
                      : tableRows.map(renderRow)}
                    {rows.length === 0 && !people.isPending && (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          className="py-8 text-center text-muted-foreground"
                        >
                          {search.ancestors ? t("people.noAncestors") : t("people.noMatches")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : groups ? (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <section key={group.id} className="space-y-3">
                      <div className="rounded-md bg-muted/40 px-3 py-1.5">
                        <GroupHeader
                          group={group}
                          collapsed={collapsed.has(group.id)}
                          onToggle={() => toggleGroup(group.id)}
                        />
                      </div>
                      {!collapsed.has(group.id) && (
                        <PeopleCardView
                          people={group.people}
                          familyLine={detailed ? (person) => familyLine(person, settings, t) : null}
                        />
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <PeopleCardView
                  people={rows}
                  familyLine={detailed ? (person) => familyLine(person, settings, t) : null}
                />
              )}
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>{t("people.pageOf", { page, totalPages })}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => update({ page: page - 1 === 1 ? undefined : page - 1 }, true)}
                >
                  {t("people.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= total}
                  onClick={() => update({ page: page + 1 }, true)}
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

/** What the columns show beyond the data itself — from Settings → People list and the member's row choice. */
interface ColumnDisplay {
  dateDetail: TreeDateDetail;
  /** The detailed row's second line under the name; null in compact rows. */
  familyLine: ((person: PersonListItem) => string | null) | null;
  /** Places under the Born/Died dates, and no Place column. */
  placesUnderDates: boolean;
}

/** A column header that sorts the list: the current order's arrow, or a faint both-ways one. */
function SortHeader({
  columnId,
  label,
  sort,
}: {
  columnId: string;
  label: string;
  sort: SortState;
}) {
  const { t } = useTranslation();
  const active = isSortedBy(columnId, sort.sortBy);
  const Icon = !active ? ChevronsUpDownIcon : sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <button
      type="button"
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "text-foreground",
      )}
      onClick={() => sort.onSort(COLUMN_SORT[columnId]!)}
      title={t("people.sortColumn", { column: label })}
    >
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden="true" />
    </button>
  );
}

function buildColumns(
  options: ConfigurableOptionRow[],
  t: TFunction,
  language: SupportedLanguage,
  sort: SortState,
  display: ColumnDisplay,
) {
  const dash = "—";
  // Settings → People list: full dates, or just the years.
  const showDate = (date: PersonListItem["birth"]) =>
    (display.dateDetail === "years" ? yearOf(date) : formatDisplayDate(date, language)) ?? dash;
  // A date with, in detailed rows, its place on a line of its own under it.
  const dateCell = (date: string, place: string | null) =>
    display.placesUnderDates && place ? (
      <span>
        {date}
        <span className="block text-xs text-muted-foreground">{place}</span>
      </span>
    ) : (
      date
    );
  const sortable = (columnId: string, label: string) => () => (
    <SortHeader columnId={columnId} label={label} sort={sort} />
  );
  return helper.columns([
    // Icon-only, first, with no visible title — the word stays in the DOM as
    // screen-reader text, since `GenderIcon` itself is `aria-hidden`.
    helper.accessor("gender", {
      id: "gender",
      header: () => <span className="sr-only">{t("common.gender.label")}</span>,
      cell: (context) => (
        <span className="flex items-center">
          <GenderIcon gender={context.getValue()} className="size-4" />
          <span className="sr-only">{genderLabel(context.getValue(), t)}</span>
        </span>
      ),
    }),
    helper.accessor((row) => formatPersonName(row), {
      id: "name",
      header: sortable("name", t("people.columnPerson")),
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
            <span>
              {context.getValue()}
              {/* Why a name search found them, when the name shown doesn't say. */}
              {person.alsoKnownAs && (
                <span className="block text-xs text-muted-foreground">
                  {t("people.alsoKnownAs", { name: person.alsoKnownAs })}
                </span>
              )}
              <FamilyLine line={display.familyLine?.(person) ?? null} />
            </span>
          </Link>
        );
      },
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
      header: sortable("age", t("people.columnAge")),
      cell: (context) => context.getValue() ?? dash,
    }),
    helper.accessor((row) => formatLifespan(row) ?? dash, {
      id: "lifespan",
      header: t("people.columnLifespan"),
    }),
    helper.accessor((row) => showDate(row.birth), {
      id: "born",
      header: sortable("born", t("people.columnBorn")),
      cell: (context) => dateCell(context.getValue(), context.row.original.birthPlace),
    }),
    helper.accessor((row) => (row.isLiving ? dash : showDate(row.death)), {
      id: "died",
      header: sortable("died", t("people.columnDied")),
      cell: (context) =>
        dateCell(
          context.getValue(),
          context.row.original.isLiving ? null : context.row.original.deathPlace,
        ),
    }),
    // With places under the dates, a Place column would only repeat them.
    ...(display.placesUnderDates
      ? []
      : [
          helper.accessor((row) => row.birthPlace ?? row.deathPlace ?? dash, {
            id: "place",
            header: sortable("place", t("common.place")),
          }),
        ]),
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

/**
 * The detailed row's second line — parents and spouses. Truncated to one
 * line, with the whole text as a tooltip, so a large family doesn't make
 * one row tower over the rest.
 */
function FamilyLine({ line }: { line: string | null }) {
  if (!line) return null;
  return (
    <span className="block max-w-md truncate text-xs text-muted-foreground" title={line}>
      {line}
    </span>
  );
}

/** The columns a member may hide — every one but the name and the row actions. */
function isChoosableColumn(id: string): id is PeopleListColumn {
  return (peopleListColumnSchema.options as readonly string[]).includes(id);
}

/** How a column is named in the chooser — the gender column has no visible header of its own. */
function columnLabel(column: PeopleListColumn, t: TFunction): string {
  switch (column) {
    case "gender":
      return t("common.gender.label");
    case "status":
      return t("people.columnStatus");
    case "age":
      return t("people.columnAge");
    case "lifespan":
      return t("people.columnLifespan");
    case "born":
      return t("people.columnBorn");
    case "died":
      return t("people.columnDied");
    case "place":
      return t("common.place");
    case "sources":
      return t("people.columnSources");
    case "publicId":
      return t("people.columnId");
  }
}

/**
 * The table's column menu: a checkbox per column, saved on the member's
 * profile at once. "Use the site's columns" forgets their choice, so they
 * follow Settings → People list again.
 */
function ColumnChooser({
  visible,
  hidePlace,
  isOwnChoice,
  onChange,
}: {
  visible: ReadonlySet<string>;
  hidePlace: boolean;
  isOwnChoice: boolean;
  onChange: (columns: PeopleListColumn[] | null) => void;
}) {
  const { t } = useTranslation();
  const choosable = peopleListColumnSchema.options.filter(
    (column) => !(hidePlace && column === "place"),
  );
  return (
    <Popover
      align="end"
      title={t("people.columnsTitle")}
      trigger={
        <Button variant="outline" size="sm">
          <Columns3Icon /> {t("people.columns")}
        </Button>
      }
    >
      <div className="space-y-2">
        {choosable.map((column) => (
          <Checkbox
            key={column}
            className="flex"
            checked={visible.has(column)}
            onCheckedChange={(checked) =>
              onChange(
                // Kept in the table's own order, whatever order they're ticked in.
                peopleListColumnSchema.options.filter((option) =>
                  option === column ? checked : visible.has(option),
                ),
              )
            }
          >
            {columnLabel(column, t)}
          </Checkbox>
        ))}
        {isOwnChoice && (
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => onChange(null)}>
            {t("people.columnsReset")}
          </Button>
        )}
      </div>
    </Popover>
  );
}

/** A group's header: its name and size, folding the group away on click. */
function GroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: PeopleGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const Icon = collapsed ? ChevronRightIcon : ChevronDownIcon;
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {group.label}
      <span className="font-normal text-muted-foreground">
        {t("people.groupCount", { count: group.count })}
        {group.people.length < group.count &&
          ` · ${t("people.groupOnThisPage", { count: group.people.length })}`}
      </span>
    </button>
  );
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
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const removePersonMutation = useMutation({
    mutationFn: removePerson,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["person", "list"] });
    },
  });

  // Deleting people is admin-only; the backend enforces the same rule.
  if (person.hasRelations || !isAdmin) {
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
            disabled={removePersonMutation.isPending}
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
