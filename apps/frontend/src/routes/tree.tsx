import {
  defaultTreeSettings,
  formatLifespan,
  formatPersonName,
  type Gender,
  treeChartKindSchema,
  type TreeOrientation,
  treeOrientationSchema,
} from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@genealogy/ui/components/dialog";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { ReadOnlyProvider } from "@genealogy/ui/lib/read-only";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Cross, UserRound, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import { publicBackendUrl } from "../lib/env";
import { formatDisplayDate } from "../lib/format-date";
import { usePermissions } from "../lib/permissions";
import { directLine, toTopolaJson, treeCard } from "../lib/topola-data";
import { useTreeSettings, useTreeSettingsQuery } from "../lib/tree-settings";
import {
  createPerson,
  getRelatives,
  getTree,
  linkParent,
  linkSpouse,
  listPersons,
  unlinkParent,
  unlinkSpouse,
} from "../server/functions/person.functions";
import { getMyProfile } from "../server/functions/profile.functions";
import { TopolaChart, type ChartKind } from "./-topola-chart";

export const Route = createFileRoute("/tree")({
  // No zod schema here (unlike the server functions this page calls) — a
  // malformed/missing personId just falls through to the "pick a person"
  // empty state below rather than needing its own error path.
  // `view` and `orientation` are optional: a link without them (the People
  // list's "View in tree", the nav link) opens with the defaults chosen on
  // the Settings page (`treeSettings.defaultChart`/`defaultOrientation`).
  // Anything unrecognised — an old `view=both` link — is dropped the same way.
  validateSearch: (search: Record<string, unknown>): TreeSearch => {
    const view = treeChartKindSchema.safeParse(search.view);
    const orientation = treeOrientationSchema.safeParse(search.orientation);
    return {
      ...(typeof search.personId === "string" ? { personId: search.personId } : {}),
      ...(view.success ? { view: view.data } : {}),
      ...(orientation.success ? { orientation: orientation.data } : {}),
    };
  },
  // No personId in the URL yet: default to the person linked to the viewer's
  // own account (userProfiles.personId), same as the "this is me" pick on
  // the Profile page, so the tree opens already centered on the visitor
  // rather than blank. If they haven't linked a person, fall through with no
  // redirect — TreePage's own empty state (RootPicker) is the person
  // selector the user should see before any tree loads.
  beforeLoad: async ({ search }) => {
    if (search.personId) return;
    const profile = await getMyProfile();
    if (profile.personId) {
      throw redirect({ to: "/tree", search: { personId: profile.personId } });
    }
  },
  component: TreePage,
});

type Orientation = TreeOrientation;

interface TreeSearch {
  personId?: string;
  view?: ChartKind;
  orientation?: Orientation;
}

/**
 * The URL for a tree centred on `personId`, keeping the chart and direction
 * the user is looking at. Both are always written out: leaving one out now
 * means "the Settings default", which can differ from what's on screen.
 */
function treeSearch(personId: string, view: ChartKind, orientation: Orientation): TreeSearch {
  return { personId, view, orientation };
}

type TreeData = Awaited<ReturnType<typeof getTree>>;
type TreePersonRow = TreeData["people"][number];
type TreeEdgeRow = TreeData["parentEdges"][number];
type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

function TreePage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  // Waits for the settings so the tree doesn't draw one chart and then
  // switch to the configured default. If they fail to load, the built-in
  // defaults apply rather than blocking the page.
  const settings = useTreeSettingsQuery();
  if (settings.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("tree.loading")}
      </div>
    );
  }
  const defaults = settings.data ?? defaultTreeSettings;
  const personId = search.personId;
  const view = search.view ?? defaults.defaultChart;
  const orientation = search.orientation ?? defaults.defaultOrientation;

  return (
    // No page title/subtitle here — the tree view is the whole page, and the
    // detail panel + canvas want every pixel of vertical space they can get.
    // `h-full` fills exactly what __root.tsx's <main> leaves available for
    // the /tree route (h-screen + flex-1 there, see isNoScrollPath) — no
    // guessing at the header's pixel height, and no page-level scrollbar.
    <div className="flex h-full flex-col gap-4">
      {personId ? (
        <FamilyTree key={personId} rootId={personId} view={view} orientation={orientation} />
      ) : (
        <RootPicker />
      )}
    </div>
  );
}

function RootPicker() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
  });
  const options = search.data?.items ?? [];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("tree.pickPersonPrefix")}{" "}
        <Link to="/people" className="underline hover:text-foreground">
          {t("tree.personList")}
        </Link>
        .
      </p>
      <Combobox<PersonListItem>
        aria-label={t("person.family.searchPeople")}
        className="w-full max-w-sm"
        items={options}
        inputValue={query}
        onInputChange={setQuery}
        onChange={(value) => {
          if (typeof value !== "string") return;
          void navigate({ to: "/tree", search: { personId: value } });
        }}
      >
        <ComboboxInput placeholder={t("person.family.searchPeople")} />
        <ComboboxContent<PersonListItem>
          renderEmptyState={() => <ComboboxEmpty>{t("person.family.noMatches")}</ComboboxEmpty>}
        >
          {(item) => (
            <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
              {formatPersonName(item)}
              {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
            </ComboboxItem>
          )}
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function genderTextClasses(gender: Gender): string {
  if (gender === "M") return "text-sky-600 dark:text-sky-400";
  if (gender === "F") return "text-rose-600 dark:text-rose-400";
  return "text-slate-500 dark:text-slate-400";
}

interface ExtraTreeData {
  people: TreePersonRow[];
  parentEdges: TreeEdgeRow[];
  spouseEdges: Array<[string, string]>;
  parentsKnownIds: string[];
  childrenKnownIds: string[];
}

const EMPTY_EXTRA: ExtraTreeData = {
  people: [],
  parentEdges: [],
  spouseEdges: [],
  parentsKnownIds: [],
  childrenKnownIds: [],
};

interface MergedTree {
  rootId: string;
  people: TreePersonRow[];
  parentEdges: TreeEdgeRow[];
  spouseEdges: Array<[string, string]>;
  parentsKnownIds: Set<string>;
  childrenKnownIds: Set<string>;
}

/**
 * Layers locally-added people/edges (from "add relative" and "load more" —
 * see `AddRelativeButton`/the expand mutation below) on top of the base
 * fetch, deduplicating by id/edge key. Kept as a plain merge rather than
 * refetching `person.tree` after every action: a refetch would re-run the
 * whole layout and could shuffle everyone else on screen for what's usually
 * a one-person addition.
 */
/** Edge keys, shared by `mergeTree`'s dedup and the removal set below so the two always agree. */
function parentEdgeKey(parentId: string, childId: string): string {
  return `${parentId}->${childId}`;
}
function spouseEdgeKey(pair: readonly [string, string]): string {
  return pair.toSorted().join("|");
}

/**
 * Relationships removed from the panel during this visit. Applied on top of
 * the merge rather than refetching the tree, for the same reason additions
 * are (see `mergeTree`): a refetch would also drop everything "Load more"
 * pulled in, and reshuffle the whole layout.
 */
interface RemovedEdges {
  parentEdges: ReadonlySet<string>;
  spouseEdges: ReadonlySet<string>;
}
const NO_REMOVED_EDGES: RemovedEdges = { parentEdges: new Set(), spouseEdges: new Set() };

function mergeTree(base: TreeData, extra: ExtraTreeData, removed: RemovedEdges): MergedTree {
  const peopleById = new Map(base.people.map((person) => [person.id, person]));
  for (const person of extra.people) peopleById.set(person.id, person);

  const parentEdgeKeys = new Set<string>();
  const parentEdges: TreeEdgeRow[] = [];
  for (const edge of [...base.parentEdges, ...extra.parentEdges]) {
    const key = parentEdgeKey(edge.parentId, edge.childId);
    if (parentEdgeKeys.has(key) || removed.parentEdges.has(key)) continue;
    parentEdgeKeys.add(key);
    parentEdges.push(edge);
  }

  const spouseEdgeKeys = new Set<string>();
  const spouseEdges: Array<[string, string]> = [];
  for (const pair of [...base.spouseEdges, ...extra.spouseEdges]) {
    const key = spouseEdgeKey(pair);
    if (spouseEdgeKeys.has(key) || removed.spouseEdges.has(key)) continue;
    spouseEdgeKeys.add(key);
    spouseEdges.push(pair);
  }

  return keepConnected({
    rootId: base.rootId,
    people: [...peopleById.values()],
    parentEdges,
    spouseEdges,
    parentsKnownIds: new Set([...base.parentsKnownIds, ...extra.parentsKnownIds]),
    childrenKnownIds: new Set([...base.childrenKnownIds, ...extra.childrenKnownIds]),
  });
}

/** Keeps `ids` and only the edges whose both ends are in it. */
function restrictTo(tree: MergedTree, ids: ReadonlySet<string>): MergedTree {
  return {
    ...tree,
    people: tree.people.filter((person) => ids.has(person.id)),
    parentEdges: tree.parentEdges.filter((edge) => ids.has(edge.parentId) && ids.has(edge.childId)),
    spouseEdges: tree.spouseEdges.filter(([a, b]) => ids.has(a) && ids.has(b)),
  };
}

/** Everyone reachable from `startIds` by repeatedly following `next`. */
function reachable(startIds: string[], next: (id: string) => string[]): Set<string> {
  const seen = new Set(startIds);
  const queue = [...startIds];
  while (queue.length > 0) {
    for (const id of next(queue.shift()!)) {
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return seen;
}

/**
 * Drops anyone no longer connected to the root by any edge — after a removal
 * in the panel, a removed parent and everyone above them are no longer part
 * of this tree. Topola wouldn't draw them anyway (it only walks families
 * from the root), but the panel and "Load more" read this data too.
 */
function keepConnected(tree: MergedTree): MergedTree {
  const neighbors = new Map<string, string[]>();
  const connect = (a: string, b: string) => {
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  };
  for (const edge of tree.parentEdges) connect(edge.parentId, edge.childId);
  for (const [a, b] of tree.spouseEdges) connect(a, b);
  return restrictTo(
    tree,
    reachable([tree.rootId], (id) => neighbors.get(id) ?? []),
  );
}

function FamilyTree({
  rootId,
  view,
  orientation,
}: {
  rootId: string;
  view: ChartKind;
  orientation: Orientation;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const treeSettings = useTreeSettings();
  const { canEdit } = usePermissions();
  const navigate = useNavigate();
  const treeQuery = useQuery({
    queryKey: ["person", "tree", rootId],
    queryFn: () => getTree({ data: { id: rootId } }),
  });

  const [extra, setExtra] = useState<ExtraTreeData>(EMPTY_EXTRA);
  const [removed, setRemoved] = useState<RemovedEdges>(NO_REMOVED_EDGES);

  const addToExtra = (update: Partial<ExtraTreeData>) => {
    setExtra((previous) => ({
      people: [...previous.people, ...(update.people ?? [])],
      parentEdges: [...previous.parentEdges, ...(update.parentEdges ?? [])],
      spouseEdges: [...previous.spouseEdges, ...(update.spouseEdges ?? [])],
      parentsKnownIds: [...previous.parentsKnownIds, ...(update.parentsKnownIds ?? [])],
      childrenKnownIds: [...previous.childrenKnownIds, ...(update.childrenKnownIds ?? [])],
    }));
    // A link re-added (or reloaded from the server) after being removed this
    // visit is real again — without this, the removal would keep hiding it.
    const readded = new Set([
      ...(update.parentEdges ?? []).map((edge) => parentEdgeKey(edge.parentId, edge.childId)),
      ...(update.spouseEdges ?? []).map((pair) => spouseEdgeKey(pair)),
    ]);
    if (readded.size > 0) {
      setRemoved((previous) => ({
        parentEdges: new Set([...previous.parentEdges].filter((key) => !readded.has(key))),
        spouseEdges: new Set([...previous.spouseEdges].filter((key) => !readded.has(key))),
      }));
    }
  };

  const addToRemoved = (removal: { parentEdge?: string; spouseEdge?: string }) => {
    setRemoved((previous) => ({
      parentEdges: removal.parentEdge
        ? new Set([...previous.parentEdges, removal.parentEdge])
        : previous.parentEdges,
      spouseEdges: removal.spouseEdge
        ? new Set([...previous.spouseEdges, removal.spouseEdge])
        : previous.spouseEdges,
    }));
  };

  // `merged` is the whole tree as this visit knows it — what the panel reads
  // and what topola draws. Which part of it shows is the chart type's job
  // now (an ancestor chart simply doesn't walk down), not a filter here.
  const merged = useMemo(
    () => (treeQuery.data ? mergeTree(treeQuery.data, extra, removed) : null),
    [treeQuery.data, extra, removed],
  );
  // Memoized so TopolaChart only re-renders the chart when the data changes.
  const chartData = useMemo(
    () =>
      merged
        ? toTopolaJson(merged, {
            formatDate: (date) => formatDisplayDate(date, language),
            photoUrl: (path) => `${publicBackendUrl}/uploads/${path}`,
          })
        : null,
    [merged, language],
  );
  const directLineIds = useMemo(
    () => (merged ? directLine(merged.rootId, merged.parentEdges) : new Set<string>()),
    [merged],
  );
  const cards = useMemo(
    () =>
      new Map(
        (merged?.people ?? []).map((person) => [
          person.id,
          treeCard(person, {
            name: formatPersonName(person),
            photoUrl: (path) => `${publicBackendUrl}/uploads/${path}`,
            formatDate: (date) => formatDisplayDate(date, language),
            dateDetail: treeSettings.dateDetail,
            isDirectLine: directLineIds.has(person.id),
          }),
        ]),
      ),
    [merged, language, treeSettings.dateDetail, directLineIds],
  );

  // Defaults to the root rather than nobody, so the detail panel is already
  // populated with the person the tree is centered on instead of an empty
  // canvas that needs a click before showing anything. `FamilyTree` is keyed
  // by `rootId` in TreePage, so this re-initializes whenever the centered
  // person changes. Never null once a tree has loaded — the panel always has
  // a person to show, so there's no close/deselect action, only ever
  // switching who's shown.
  const [selectedId, setSelectedId] = useState<string>(rootId);

  const expandMutation = useMutation({
    mutationFn: async ({ nodeId, direction }: { nodeId: string; direction: "up" | "down" }) => {
      const relatives = await getRelatives({ data: { id: nodeId } });
      const newPeople: TreePersonRow[] =
        direction === "up" ? relatives.parents : relatives.children;
      const parentEdges: TreeEdgeRow[] =
        direction === "up"
          ? relatives.parents.map((parent) => ({
              parentId: parent.id,
              childId: nodeId,
              parentage: parent.parentage,
            }))
          : relatives.children.map((child) => ({
              parentId: nodeId,
              childId: child.id,
              // relatives() doesn't report parentage for the *children* side
              // (see PersonService.relatives) — display only uses this for
              // dedup keys, so the placeholder value is harmless.
              parentage: "unknown",
            }));

      // Mirrors what the initial fetch does for everyone it collects: also
      // pull in each newly-discovered person's own spouse, one hop, so an
      // expanded grandparent's own spouse still shows up beside them.
      const spouseResults = await Promise.all(
        newPeople.map((person) => getRelatives({ data: { id: person.id } })),
      );
      const spousePeople: TreePersonRow[] = [];
      const spouseEdges: Array<[string, string]> = [];
      newPeople.forEach((person, index) => {
        for (const spouse of spouseResults[index]!.spouses) {
          spousePeople.push(spouse);
          spouseEdges.push([person.id, spouse.id]);
        }
      });

      // Each new person's *other* parents who are already on the canvas — a
      // grandchild loaded under one parent also belongs to that parent's
      // spouse. Same gap the initial load fills with `parentEdgesAmong`;
      // these come with their parentage, which the panel needs for
      // Father/Mother.
      const onCanvas = new Set([
        ...(merged?.people.map((row) => row.id) ?? []),
        ...newPeople.map((row) => row.id),
        ...spousePeople.map((row) => row.id),
      ]);
      newPeople.forEach((person, index) => {
        for (const parent of spouseResults[index]!.parents) {
          if (!onCanvas.has(parent.id)) continue;
          parentEdges.push({
            parentId: parent.id,
            childId: person.id,
            parentage: parent.parentage,
          });
        }
      });

      return {
        people: [...newPeople, ...spousePeople],
        parentEdges,
        spouseEdges,
        parentsKnownIds: direction === "up" ? [nodeId] : [],
        childrenKnownIds: direction === "down" ? [nodeId] : [],
      } satisfies Partial<ExtraTreeData>;
    },
    onSuccess: (update) => addToExtra(update),
  });

  if (treeQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("tree.loading")}
      </div>
    );
  }

  if (treeQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {t("tree.loadErrorTree", { message: treeQuery.error.message })}
      </p>
    );
  }

  // Falls back to the root when the selected person is gone — disconnected
  // by a removal in the panel.
  const selectedPerson =
    merged?.people.find((person) => person.id === selectedId) ??
    merged?.people.find((person) => person.id === rootId) ??
    null;

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {merged && selectedPerson && (
        <ReadOnlyProvider readOnly={!canEdit}>
          <DetailPanel
            person={selectedPerson}
            isRoot={selectedPerson.id === merged.rootId}
            tree={merged}
            centerSearch={(personId) => treeSearch(personId, view, orientation)}
            onAdded={addToExtra}
            onRemoved={addToRemoved}
            onExpand={(direction) =>
              expandMutation.mutate({ nodeId: selectedPerson.id, direction })
            }
            expandingDirection={
              expandMutation.isPending ? expandMutation.variables?.direction : null
            }
          />
        </ReadOnlyProvider>
      )}
      <div className="relative flex-1 overflow-hidden rounded-lg border">
        <div className="absolute top-3 left-3 z-10 flex flex-wrap items-start gap-2">
          <div className="rounded-md bg-card shadow-sm">
            <ButtonRadioGroup
              aria-label={t("tree.view.label")}
              value={view}
              onChange={(next) =>
                void navigate({ to: "/tree", search: treeSearch(rootId, next, orientation) })
              }
              options={[
                { value: "relatives", label: t("tree.view.relatives") },
                { value: "ancestors", label: t("tree.view.ancestors") },
                { value: "descendants", label: t("tree.view.descendants") },
              ]}
            />
          </div>
          <div className="rounded-md bg-card shadow-sm">
            <ButtonRadioGroup
              aria-label={t("tree.orientation.label")}
              value={orientation}
              onChange={(next) =>
                void navigate({ to: "/tree", search: treeSearch(rootId, view, next) })
              }
              options={[
                { value: "vertical", label: t("tree.orientation.vertical") },
                { value: "horizontal", label: t("tree.orientation.horizontal") },
              ]}
            />
          </div>
        </div>
        <p className="pointer-events-none absolute right-3 bottom-3 z-10 max-w-xs text-right text-xs text-muted-foreground">
          {t("tree.chartHint")}
        </p>
        {chartData && (
          <TopolaChart
            data={chartData}
            cards={cards}
            settings={treeSettings}
            rootId={rootId}
            chartKind={view}
            horizontal={orientation === "horizontal"}
            selectedId={selectedPerson?.id ?? rootId}
            onSelect={setSelectedId}
            // Double-click centres the tree on a person — the same as "Center
            // tree here" in the panel, keeping the current chart and direction.
            onCenter={(personId) => {
              if (personId === rootId) return;
              void navigate({ to: "/tree", search: treeSearch(personId, view, orientation) });
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * `remove` adds a confirm-first ✕ that unlinks this one relationship — never
 * the person. Siblings don't get one: they share a parent rather than having
 * a link of their own, the same reason the person page has none for them.
 */
function RelativeRow({
  label,
  person,
  remove,
}: {
  label?: string;
  person: TreePersonRow;
  remove?: { relationLabel: string; onConfirm: () => void; isPending: boolean };
}) {
  const { t } = useTranslation();
  const name = formatPersonName(person);
  return (
    <div className="group flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        {label && <p className="text-xs text-muted-foreground">{label}</p>}
        <Link
          to="/people/$personId"
          params={{ personId: person.id }}
          className="truncate hover:underline"
        >
          {name}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-xs text-muted-foreground">{formatLifespan(person) ?? ""}</span>
        {remove && (
          <RemoveButton
            itemLabel={name}
            title={t("tree.removeTitle", { name, relation: remove.relationLabel })}
            description={t("tree.removeDescription")}
            actionLabel={t("tree.removeAction")}
            onConfirm={remove.onConfirm}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={t("tree.removeAria", { name, relation: remove.relationLabel })}
                isDisabled={remove.isPending}
              >
                <XIcon className="size-3.5" />
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

type AddRelativeKind = "father" | "mother" | "spouse" | "child" | "sibling";

/**
 * Search for an existing person to link, or create a blank one on the spot —
 * mirroring the person page's own "add relative" dialogs, but deliberately
 * without their full create-with-details form: a blank record plus a link is
 * enough from the tree canvas, and "View full profile" in the panel is one
 * click away to fill in a name afterward. Full parentage-type choice (step/
 * adopted/etc.) also stays on the person page — this only ever links "birth".
 *
 * A sibling has no edge of its own: it's linked as a birth child of every
 * parent in `siblingParentIds` (a full sibling). Half-siblings, which need a
 * choice of which parent, stay on the person page's own Add sibling dialog.
 * The new sibling only joins the canvas when all those parents are already on
 * it (`siblingParentsOnCanvas`) — otherwise it would float unconnected — but
 * it always shows in the panel's list, which reads `person.relatives`.
 */
function AddRelativeButton({
  subjectId,
  kind,
  onAdded,
  excludeIds,
  siblingParentIds = [],
  siblingParentsOnCanvas = false,
}: {
  subjectId: string;
  kind: AddRelativeKind;
  onAdded: (update: Partial<ExtraTreeData>) => void;
  /** People who can't be picked — e.g. existing siblings and parents, for a sibling. */
  excludeIds?: ReadonlySet<string>;
  siblingParentIds?: readonly string[];
  siblingParentsOnCanvas?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open,
  });
  const options = (search.data?.items ?? []).filter(
    (candidate) => candidate.id !== subjectId && !excludeIds?.has(candidate.id),
  );
  const kindLabel = t(`tree.kind.${kind}`);

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const linkSpouseMutation = useMutation({ mutationFn: linkSpouse });
  const createPersonMutation = useMutation({ mutationFn: createPerson });

  // Accepts a plain `TreePersonRow`, not `PersonListItem` — `createAndLink`
  // below passes through `createPerson`'s result, which has no `hasRelations`
  // (that field only exists on `listPersons` rows, computed there for the
  // person list's delete-action guard).
  const link = async (target: TreePersonRow) => {
    if (kind === "spouse") {
      await linkSpouseMutation.mutateAsync({ data: { aId: subjectId, bId: target.id } });
      onAdded({ people: [target], spouseEdges: [[subjectId, target.id]] });
    } else if (kind === "sibling") {
      await Promise.all(
        siblingParentIds.map((parentId) =>
          linkParentMutation.mutateAsync({
            data: { parentId, childId: target.id, parentage: "birth" },
          }),
        ),
      );
      if (siblingParentsOnCanvas) {
        onAdded({
          people: [target],
          parentEdges: siblingParentIds.map((parentId) => ({
            parentId,
            childId: target.id,
            parentage: "birth",
          })),
        });
      }
    } else if (kind === "child") {
      await linkParentMutation.mutateAsync({
        data: { parentId: subjectId, childId: target.id, parentage: "birth" },
      });
      onAdded({
        people: [target],
        parentEdges: [{ parentId: subjectId, childId: target.id, parentage: "birth" }],
      });
    } else {
      await linkParentMutation.mutateAsync({
        data: { parentId: target.id, childId: subjectId, parentage: "birth" },
      });
      onAdded({
        people: [target],
        parentEdges: [{ parentId: target.id, childId: subjectId, parentage: "birth" }],
      });
    }
    // The panel's Siblings list (and the person page, if open elsewhere)
    // reads this person's relatives, so refresh it after any link.
    await queryClient.invalidateQueries({ queryKey: ["person", "relatives", subjectId] });
    setOpen(false);
    setQuery("");
  };

  const createAndLink = async () => {
    const presetGender = kind === "father" ? "M" : kind === "mother" ? "F" : "U";
    const created = await createPersonMutation.mutateAsync({ data: { gender: presetGender } });
    // Only editors can create people, and editors see everyone unredacted.
    await link({ ...created, redacted: false });
  };

  // A plain dialog rather than a FormDialog, so ReadOnlyProvider can't hide it.
  if (!canEdit) return null;

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Button variant="outline" size="sm" className="w-full justify-start">
        {t("tree.addLabel", { kind: kindLabel })}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tree.addTitle", { kind: kindLabel })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Combobox<PersonListItem>
            aria-label={t("tree.searchForKind", { kind: kindLabel })}
            items={options}
            inputValue={query}
            onInputChange={setQuery}
            onChange={(value) => {
              const target = options.find((candidate) => candidate.id === value);
              if (target) void link(target);
            }}
          >
            <ComboboxInput placeholder={t("person.family.searchPeople")} />
            <ComboboxContent<PersonListItem>
              renderEmptyState={() => <ComboboxEmpty>{t("person.family.noMatches")}</ComboboxEmpty>}
            >
              {(item) => (
                <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
                  {formatPersonName(item)}
                  {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
                </ComboboxItem>
              )}
            </ComboboxContent>
          </Combobox>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            isDisabled={createPersonMutation.isPending}
            onPress={() => void createAndLink()}
          >
            {t("tree.createNewPerson")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailPanel({
  person,
  isRoot,
  tree,
  centerSearch,
  onAdded,
  onRemoved,
  onExpand,
  expandingDirection,
}: {
  person: TreePersonRow;
  isRoot: boolean;
  tree: MergedTree;
  /** Search params for "Center tree here", keeping the current chart and direction. */
  centerSearch: (personId: string) => TreeSearch;
  onAdded: (update: Partial<ExtraTreeData>) => void;
  onRemoved: (removal: { parentEdge?: string; spouseEdge?: string }) => void;
  onExpand: (direction: "up" | "down") => void;
  expandingDirection: "up" | "down" | null | undefined;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const unlinkParentMutation = useMutation({ mutationFn: unlinkParent });
  const unlinkSpouseMutation = useMutation({ mutationFn: unlinkSpouse });
  const isRemoving = unlinkParentMutation.isPending || unlinkSpouseMutation.isPending;

  // Both people's relatives change (and so the panel's Siblings list and any
  // open person page), so refresh both before taking the edge off the canvas.
  const afterRemoval = async (
    otherId: string,
    removal: { parentEdge?: string; spouseEdge?: string },
  ) => {
    await Promise.all(
      [person.id, otherId].map((id) =>
        queryClient.invalidateQueries({ queryKey: ["person", "relatives", id] }),
      ),
    );
    onRemoved(removal);
  };
  const removeParentLink = (parentId: string, childId: string, relationLabel: string) => ({
    relationLabel,
    isPending: isRemoving,
    onConfirm: () =>
      unlinkParentMutation.mutate(
        { data: { parentId, childId } },
        {
          onSuccess: () =>
            afterRemoval(parentId === person.id ? childId : parentId, {
              parentEdge: parentEdgeKey(parentId, childId),
            }),
        },
      ),
  });
  const removeSpouseLink = (spouseId: string) => ({
    relationLabel: t("tree.kind.spouse"),
    isPending: isRemoving,
    onConfirm: () =>
      unlinkSpouseMutation.mutate(
        { data: { aId: person.id, bId: spouseId } },
        {
          onSuccess: () =>
            afterRemoval(spouseId, { spouseEdge: spouseEdgeKey([person.id, spouseId]) }),
        },
      ),
  });
  const removeError = unlinkParentMutation.error ?? unlinkSpouseMutation.error;
  const peopleById = new Map(tree.people.map((row) => [row.id, row]));

  const parents = tree.parentEdges
    .filter((edge) => edge.childId === person.id)
    .flatMap((edge) => {
      const row = peopleById.get(edge.parentId);
      return row ? [{ ...row, parentage: edge.parentage }] : [];
    });
  const father = parents.find((parent) => parent.parentage === "birth" && parent.gender === "M");
  const mother = parents.find((parent) => parent.parentage === "birth" && parent.gender === "F");
  const otherParents = parents.filter((parent) => parent !== father && parent !== mother);

  const children = tree.parentEdges
    .filter((edge) => edge.parentId === person.id)
    .flatMap((edge) => peopleById.get(edge.childId) ?? []);

  const spouses = tree.spouseEdges
    .filter((pair) => pair.includes(person.id))
    .flatMap((pair) => {
      const spouseId = pair[0] === person.id ? pair[1] : pair[0];
      return peopleById.get(spouseId) ?? [];
    });

  const parentsKnown = tree.parentsKnownIds.has(person.id);
  const childrenKnown = tree.childrenKnownIds.has(person.id);

  // Siblings come from the backend rather than the tree data: the tree walk
  // never fetches an ancestor's *other* children, so the canvas can't say who
  // someone's siblings are. Same query (and cache) as the person page.
  const relatives = useQuery({
    queryKey: ["person", "relatives", person.id],
    queryFn: () => getRelatives({ data: { id: person.id } }),
  });
  const siblings = relatives.data?.siblings ?? [];
  const birthParentIds = (relatives.data?.parents ?? [])
    .filter((parent) => parent.parentage === "birth")
    .map((parent) => parent.id);
  const siblingExcludeIds = new Set([
    ...siblings.map((sibling) => sibling.id),
    ...(relatives.data?.parents ?? []).map((parent) => parent.id),
  ]);
  const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;

  return (
    <div className="w-80 max-w-full shrink-0 overflow-y-auto rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="size-10">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className={genderTextClasses(person.gender)}>
              <UserRound className="size-5" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          {!person.isLiving && (
            <span
              className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-muted-foreground"
              title={t("tree.deceased")}
            >
              <Cross className="size-2.5 text-card" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{formatPersonName(person)}</p>
          <p className="text-sm text-muted-foreground">{formatLifespan(person) ?? "—"}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Link
          to="/people/$personId"
          params={{ personId: person.id }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("tree.viewFullProfile")}
        </Link>
        {!isRoot && (
          <Link
            to="/tree"
            search={centerSearch(person.id)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("tree.centerTreeHere")}
          </Link>
        )}
      </div>

      {removeError && <p className="mt-4 text-sm text-destructive">{removeError.message}</p>}

      <section className="mt-6 space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("tree.parents")}</h3>
        {father && (
          <RelativeRow
            label={t("tree.father")}
            person={father}
            remove={removeParentLink(father.id, person.id, t("tree.kind.father"))}
          />
        )}
        {!father && parentsKnown && (
          <AddRelativeButton subjectId={person.id} kind="father" onAdded={onAdded} />
        )}
        {mother && (
          <RelativeRow
            label={t("tree.mother")}
            person={mother}
            remove={removeParentLink(mother.id, person.id, t("tree.kind.mother"))}
          />
        )}
        {!mother && parentsKnown && (
          <AddRelativeButton subjectId={person.id} kind="mother" onAdded={onAdded} />
        )}
        {otherParents.map((parent) => (
          <RelativeRow
            key={parent.id}
            person={parent}
            remove={removeParentLink(parent.id, person.id, t("tree.kind.parent"))}
          />
        ))}
        {!parentsKnown && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            isDisabled={expandingDirection === "up"}
            onPress={() => onExpand("up")}
          >
            {expandingDirection === "up" ? t("tree.loading") : t("tree.loadAncestors")}
          </Button>
        )}
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("tree.spouses")}</h3>
        {spouses.map((spouse) => (
          <RelativeRow key={spouse.id} person={spouse} remove={removeSpouseLink(spouse.id)} />
        ))}
        <AddRelativeButton subjectId={person.id} kind="spouse" onAdded={onAdded} />
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">
          {t("tree.children")}
        </h3>
        {children.map((child) => (
          <RelativeRow
            key={child.id}
            person={child}
            remove={removeParentLink(person.id, child.id, t("tree.kind.child"))}
          />
        ))}
        {childrenKnown && (
          <AddRelativeButton subjectId={person.id} kind="child" onAdded={onAdded} />
        )}
        {!childrenKnown && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            isDisabled={expandingDirection === "down"}
            onPress={() => onExpand("down")}
          >
            {expandingDirection === "down" ? t("tree.loading") : t("tree.loadDescendants")}
          </Button>
        )}
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">
          {t("tree.siblings")}
        </h3>
        {relatives.isPending ? (
          <p className="text-sm text-muted-foreground">{t("tree.loading")}</p>
        ) : (
          <>
            {siblings.map((sibling) => (
              <RelativeRow key={sibling.id} person={sibling} />
            ))}
            {birthParentIds.length > 0 ? (
              <AddRelativeButton
                subjectId={person.id}
                kind="sibling"
                onAdded={onAdded}
                excludeIds={siblingExcludeIds}
                siblingParentIds={birthParentIds}
                siblingParentsOnCanvas={birthParentIds.every((id) => peopleById.has(id))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t("tree.addParentFirst")}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
