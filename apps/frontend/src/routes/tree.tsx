import {
  defaultTreeSettings,
  formatKinship,
  formatLifespan,
  formatPersonName,
  kinshipsFrom,
  type Gender,
  treeChartKindSchema,
  type TreeOrientation,
  treeOrientationSchema,
} from "@genealogy/core";
import {
  directLine,
  marriageKey,
  marriageLabel,
  toTopolaJson,
  treeCard,
} from "@genealogy/tree-chart";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Combobox } from "@genealogy/ui/components/combobox";
import { Dialog } from "@genealogy/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@genealogy/ui/components/dropdown-menu";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { ReadOnlyProvider } from "@genealogy/ui/lib/read-only";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Cross, DownloadIcon, Loader2, SearchIcon, UserRound, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import { publicBackendUrl } from "../lib/env";
import { formatDisplayDate } from "../lib/format-date";
import { usePermissions } from "../lib/permissions";
import { lastTreeQuery } from "../lib/queries";
import {
  addOptions,
  type AddOption,
  type AddRelativeKind,
  type ExpandDirection,
} from "../lib/tree-add-options";
import { downloadFile, exportFilename, type TreeExportFormat } from "../lib/tree-export";
import { useTreeSettings, useTreeSettingsQuery } from "../lib/tree-settings";
import {
  createPerson,
  getRelatives,
  getTree,
  linkParent,
  linkSpouse,
  unlinkParent,
  unlinkSpouse,
} from "../server/functions/person.functions";
import {
  getLastTreeView,
  getMyProfile,
  saveLastTreeView,
} from "../server/functions/profile.functions";
import { getTreeSettings } from "../server/functions/settings.functions";
import { formatPersonWithLifespan, PersonPicker } from "./-person-picker";
import { TopolaChart, type ChartKind, type ChartPoint, type TreeChartApi } from "./-topola-chart";

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
  // No personId in the URL yet: reopen where this member last had the tree
  // ("remember where I was", unless turned off in Settings), else default to
  // the person linked to their own account (userProfiles.personId), same as
  // the "this is me" pick on the Profile page, so the tree opens already
  // centered rather than blank. With neither, fall through with no redirect
  // — TreePage's own empty state (RootPicker) is the person selector the
  // user should see before any tree loads. Runs on the server for the first
  // page load, which is why the last view lives on the profile and not in
  // localStorage.
  beforeLoad: async ({ search }) => {
    if (search.personId) return;
    const [settings, lastView, profile] = await Promise.all([
      getTreeSettings(),
      getLastTreeView(),
      getMyProfile(),
    ]);
    if (settings.rememberLastView && lastView) {
      throw redirect({ to: "/tree", search: lastView });
    }
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
        // Deliberately not keyed by `personId`: a new centre person re-renders
        // the same tree (and the same topola chart), which is what lets it
        // animate there — see "Smooth re-centring" in FamilyTree.
        <FamilyTree rootId={personId} view={view} orientation={orientation} />
      ) : (
        <RootPicker />
      )}
    </div>
  );
}

function RootPicker() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("tree.pickPersonPrefix")}{" "}
        <Link to="/people" className="underline hover:text-foreground">
          {t("tree.personList")}
        </Link>
        .
      </p>
      <PersonPicker
        className="w-full max-w-sm"
        onSelect={(person) => void navigate({ to: "/tree", search: { personId: person.id } })}
      />
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

/** Anything `mergeTree` can merge: a fetched `person.tree`, or the locally added extras. */
type TreeSource = Pick<
  ExtraTreeData,
  "people" | "parentEdges" | "spouseEdges" | "parentsKnownIds" | "childrenKnownIds"
>;

/**
 * Everything this visit knows, as one tree around `rootId`: every
 * `person.tree` fetched so far (one per person the tree has been centred
 * on — see "Smooth re-centring" in FamilyTree) plus the locally-added
 * people/edges from "add relative" and "load more", deduplicated by id/edge
 * key, minus the links removed in the panel. A plain merge rather than a
 * refetch after every action: a refetch would drop everything "Load more"
 * pulled in and could shuffle everyone else on screen for what's usually a
 * one-person addition.
 */
function mergeTree(
  rootId: string,
  sources: readonly TreeSource[],
  removed: RemovedEdges,
): MergedTree {
  const peopleById = new Map<string, TreePersonRow>();
  for (const source of sources) {
    for (const person of source.people) peopleById.set(person.id, person);
  }

  const parentEdgeKeys = new Set<string>();
  const parentEdges: TreeEdgeRow[] = [];
  for (const edge of sources.flatMap((source) => source.parentEdges)) {
    const key = parentEdgeKey(edge.parentId, edge.childId);
    if (parentEdgeKeys.has(key) || removed.parentEdges.has(key)) continue;
    parentEdgeKeys.add(key);
    parentEdges.push(edge);
  }

  const spouseEdgeKeys = new Set<string>();
  const spouseEdges: Array<[string, string]> = [];
  for (const pair of sources.flatMap((source) => source.spouseEdges)) {
    const key = spouseEdgeKey(pair);
    if (spouseEdgeKeys.has(key) || removed.spouseEdges.has(key)) continue;
    spouseEdgeKeys.add(key);
    spouseEdges.push(pair);
  }

  return keepConnected({
    rootId,
    people: [...peopleById.values()],
    parentEdges,
    spouseEdges,
    parentsKnownIds: new Set(sources.flatMap((source) => source.parentsKnownIds)),
    childrenKnownIds: new Set(sources.flatMap((source) => source.childrenKnownIds)),
  });
}

/** One `person.tree` fetch — shared by the current centre's own query and the list of every centre visited. */
function treeQueryOptions(id: string) {
  return { queryKey: ["person", "tree", id], queryFn: () => getTree({ data: { id } }) };
}

/** Only the fetched trees, in visit order. A stable function, so `useQueries` keeps the result stable too. */
function fetchedTrees(results: ReadonlyArray<{ data: TreeData | undefined }>): TreeData[] {
  return results.flatMap((result) => (result.data ? [result.data] : []));
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
  // Smooth re-centring: every person the tree has been centred on this
  // visit keeps their fetched tree, so a new centre adds to what's drawn
  // instead of replacing it — topola then moves the cards it already has.
  // Grown during render (React's "adjust state when a prop changes"
  // pattern), so the new centre's fetch starts in the same render.
  const [visitedRoots, setVisitedRoots] = useState<string[]>([rootId]);
  if (!visitedRoots.includes(rootId)) setVisitedRoots([...visitedRoots, rootId]);
  const trees = useQueries({ queries: visitedRoots.map(treeQueryOptions), combine: fetchedTrees });
  // The current centre's own status (the same cache entry as above).
  const treeQuery = useQuery(treeQueryOptions(rootId));

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
  // Null until the centre person is known — on the first load, or after
  // jumping to someone unconnected to what's loaded (their tree, once it
  // arrives, has them).
  const merged = useMemo(() => {
    const tree = mergeTree(rootId, [...trees, extra], removed);
    return tree.people.some((person) => person.id === rootId) ? tree : null;
  }, [rootId, trees, extra, removed]);
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
  // How everyone is related to the centre person, from the links this
  // visit knows — so the labels follow the centre as it moves.
  const kinships = useMemo(() => (merged ? kinshipsFrom(merged.rootId, merged) : null), [merged]);
  // "⚭ 1874" per couple, from every fetched tree's dated unions. Read off
  // the fetches directly rather than merged: a couple whose link was
  // removed in the panel isn't drawn as a family, so its label never shows.
  const marriages = useMemo(() => {
    const labels = new Map<string, string>();
    for (const tree of trees) {
      for (const marriage of tree.marriages) {
        const key = marriageKey(marriage.personAId, marriage.personBId);
        const label = marriageLabel(marriage.startDate);
        if (label && !labels.has(key)) labels.set(key, label);
      }
    }
    return labels;
  }, [trees]);
  const cards = useMemo(
    () =>
      new Map(
        (merged?.people ?? []).map((person) => [
          person.id,
          treeCard(person, {
            name: formatPersonName(person),
            relation: (() => {
              const kinship = kinships?.get(person.id);
              return kinship ? formatKinship(kinship, person.gender, language) : null;
            })(),
            photoUrl: (path) => `${publicBackendUrl}/uploads/${path}`,
            formatDate: (date) => formatDisplayDate(date, language),
            dateDetail: treeSettings.dateDetail,
            isDirectLine: directLineIds.has(person.id),
            // Only where the chart would show them: an ancestors chart never
            // draws children, a descendants chart never draws parents.
            canLoadParents: view !== "descendants" && !merged!.parentsKnownIds.has(person.id),
            canLoadChildren: view !== "ancestors" && !merged!.childrenKnownIds.has(person.id),
          }),
        ]),
      ),
    [merged, kinships, language, treeSettings.dateDetail, directLineIds, view],
  );

  // Defaults to the root rather than nobody, so the detail panel is already
  // populated with the person the tree is centered on instead of an empty
  // canvas that needs a click before showing anything. Stored with the root
  // it was made under, so a new centre person selects them again. Never
  // null once a tree has loaded — the panel always has a person to show, so
  // there's no close/deselect action, only ever switching who's shown.
  const [selection, setSelection] = useState({ rootId, id: rootId });
  const selectedId = selection.rootId === rootId ? selection.id : rootId;
  const setSelectedId = (id: string) => setSelection({ rootId, id });
  const chartApi = useRef<TreeChartApi | null>(null);
  // The card menu (right-click, or the menu key) and the add-relative
  // dialog it can open — the panel's own "+ Add" buttons have their own.
  const [cardMenu, setCardMenu] = useState<{ personId: string; point: ChartPoint } | null>(null);
  const [addMenu, setAddMenu] = useState<{ personId: string; point: ChartPoint } | null>(null);
  const [addRelative, setAddRelative] = useState<({ subjectId: string } & AddOption) | null>(null);
  const [exportState, setExportState] = useState<{
    pending: boolean;
    error: string | null;
  }>({ pending: false, error: null });

  // "Remember where I was": every centre, chart and direction this member
  // lands on is saved to their profile, so /tree with no person reopens
  // here (see the route's `beforeLoad`). Fire-and-forget — failing to
  // remember must never get in the way of using the tree.
  const rememberLastView = treeSettings.rememberLastView;
  const lastViewClient = useQueryClient();
  useEffect(() => {
    if (!rememberLastView) return;
    saveLastTreeView({ data: { personId: rootId, view, orientation } })
      // The Overview's "Continue where you left off" shows this.
      .then(() => lastViewClient.invalidateQueries({ queryKey: lastTreeQuery().queryKey }))
      .catch(() => {});
  }, [rememberLastView, rootId, view, orientation, lastViewClient]);

  const exportChart = async (format: TreeExportFormat) => {
    const api = chartApi.current;
    if (!api) return;
    setExportState({ pending: true, error: null });
    try {
      const file = await api.exportChart(format);
      const root = merged?.people.find((person) => person.id === rootId);
      downloadFile(file, exportFilename(root ? formatPersonName(root) : "", format));
      setExportState({ pending: false, error: null });
    } catch (error) {
      setExportState({
        pending: false,
        error: t("tree.export.failed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  };

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

  if (!merged) {
    return treeQuery.isError ? (
      <p className="text-sm text-destructive">
        {t("tree.loadErrorTree", { message: treeQuery.error.message })}
      </p>
    ) : (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("tree.loading")}
      </div>
    );
  }

  // Falls back to the root when the selected person is gone — disconnected
  // by a removal in the panel.
  const selectedPerson =
    merged.people.find((person) => person.id === selectedId) ??
    merged.people.find((person) => person.id === rootId) ??
    null;

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {selectedPerson && (
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
              onValueChange={(next) =>
                void navigate({ to: "/tree", search: treeSearch(rootId, next, orientation) })
              }
              options={[
                { value: "relatives", label: t("tree.view.relatives") },
                { value: "ancestors", label: t("tree.view.ancestors") },
                { value: "descendants", label: t("tree.view.descendants") },
              ]}
            />
          </div>
          <DropdownMenu
            trigger={
              <Button
                variant="outline"
                className="bg-card shadow-sm"
                disabled={exportState.pending}
                aria-label={t("tree.export.label")}
              >
                {exportState.pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <DownloadIcon className="size-4" aria-hidden="true" />
                )}
                {t("tree.export.label")}
              </Button>
            }
          >
            <DropdownMenuItem onClick={() => void exportChart("png")}>
              {t("tree.export.png")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportChart("pdf")}>
              {t("tree.export.pdf")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportChart("svg")}>
              {t("tree.export.svg")}
            </DropdownMenuItem>
          </DropdownMenu>
          {exportState.error && (
            <p className="rounded-md bg-card px-2.5 py-1.5 text-sm text-destructive shadow-sm">
              {exportState.error}
            </p>
          )}
          <FindInTree
            people={merged.people}
            onFind={(personId) => {
              setSelectedId(personId);
              // Not drawn in this chart (an ancestors chart has no cousins):
              // centre the tree on them instead.
              if (!chartApi.current?.focusPerson(personId)) {
                void navigate({ to: "/tree", search: treeSearch(personId, view, orientation) });
              }
            }}
          />
          <div className="rounded-md bg-card shadow-sm">
            <ButtonRadioGroup
              aria-label={t("tree.orientation.label")}
              value={orientation}
              onValueChange={(next) =>
                void navigate({ to: "/tree", search: treeSearch(rootId, view, next) })
              }
              options={[
                { value: "vertical", label: t("tree.orientation.vertical") },
                { value: "horizontal", label: t("tree.orientation.horizontal") },
              ]}
            />
          </div>
        </div>
        {/* A new centre's relatives are on their way; what's drawn stays put. */}
        {treeQuery.isFetching && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-md bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {t("tree.loading")}
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 left-16 z-10 max-w-xs text-xs text-muted-foreground">
          {t("tree.chartHint")}
        </p>
        {chartData && (
          <TopolaChart
            data={chartData}
            cards={cards}
            marriages={marriages}
            settings={treeSettings}
            rootId={rootId}
            chartKind={view}
            horizontal={orientation === "horizontal"}
            selectedId={selectedPerson?.id ?? rootId}
            apiRef={chartApi}
            onSelect={setSelectedId}
            onContextMenu={(personId, point) => setCardMenu({ personId, point })}
            canAdd={canEdit}
            onAddMenu={(personId, point) => setAddMenu({ personId, point })}
            // Double-click centres the tree on a person — the same as "Center
            // tree here" in the panel, keeping the current chart and direction.
            onCenter={(personId) => {
              if (personId === rootId) return;
              void navigate({ to: "/tree", search: treeSearch(personId, view, orientation) });
            }}
          />
        )}
        {cardMenu && (
          <CardMenu
            key={`${cardMenu.personId}:${cardMenu.point.x}:${cardMenu.point.y}`}
            person={merged.people.find((person) => person.id === cardMenu.personId)}
            point={cardMenu.point}
            isRoot={cardMenu.personId === rootId}
            card={cards.get(cardMenu.personId)}
            tree={merged}
            onClose={() => setCardMenu(null)}
            onCenter={(personId) =>
              void navigate({ to: "/tree", search: treeSearch(personId, view, orientation) })
            }
            onOpenProfile={(personId) =>
              void navigate({ to: "/people/$personId", params: { personId } })
            }
            onExpand={(personId, direction) =>
              expandMutation.mutate({ nodeId: personId, direction })
            }
            onAddRelative={(subjectId, option) => setAddRelative({ subjectId, ...option })}
          />
        )}
        {addMenu && (
          <AddRelativeMenu
            key={`${addMenu.personId}:${addMenu.point.x}:${addMenu.point.y}`}
            person={merged.people.find((person) => person.id === addMenu.personId)}
            point={addMenu.point}
            card={cards.get(addMenu.personId)}
            tree={merged}
            onClose={() => setAddMenu(null)}
            onExpand={(personId, direction) =>
              expandMutation.mutate({ nodeId: personId, direction })
            }
            onAddRelative={(subjectId, option) => setAddRelative({ subjectId, ...option })}
          />
        )}
        {addRelative && (
          <AddRelativeDialog
            subjectId={addRelative.subjectId}
            kind={addRelative.kind}
            {...(addRelative.siblingParentIds
              ? {
                  siblingParentIds: addRelative.siblingParentIds,
                  // From the loaded tree, so the parents are on the canvas.
                  siblingParentsOnCanvas: true,
                }
              : {})}
            {...(addRelative.excludeIds ? { excludeIds: addRelative.excludeIds } : {})}
            onAdded={addToExtra}
            isOpen
            onOpenChange={(open) => {
              if (!open) setAddRelative(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A menu opened at a point on the chart rather than from a button: React
 * Aria's menu positions itself against its trigger, so an invisible trigger
 * sits at that point.
 */
function PointMenu({
  point,
  label,
  title,
  onClose,
  children,
}: {
  point: ChartPoint;
  /** The (invisible) trigger's accessible name. */
  label: string;
  /** Shown above the items — the person's name. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      trigger={
        <Button
          aria-label={label}
          className="pointer-events-none absolute size-px p-0 opacity-0"
          style={{ left: point.x, top: point.y }}
        />
      }
      header={<DropdownMenuLabel>{title}</DropdownMenuLabel>}
    >
      {children}
    </DropdownMenu>
  );
}

/**
 * The menu on a card — right-click, or the keyboard's menu key (or
 * Shift+F10) on the selected card: centre here, open the profile, load more,
 * and (editors) add a relative, under the rules in `addOptions`.
 */
function CardMenu({
  person,
  point,
  isRoot,
  card,
  tree,
  onClose,
  onCenter,
  onOpenProfile,
  onExpand,
  onAddRelative,
}: {
  person: TreePersonRow | undefined;
  point: ChartPoint;
  isRoot: boolean;
  card: { canLoadParents: boolean; canLoadChildren: boolean } | undefined;
  tree: MergedTree;
  onClose: () => void;
  onCenter: (personId: string) => void;
  onOpenProfile: (personId: string) => void;
  onExpand: (personId: string, direction: ExpandDirection) => void;
  onAddRelative: (subjectId: string, option: AddOption) => void;
}) {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  if (!person) return null;
  const id = person.id;
  const name = formatPersonName(person);
  const options = addOptions(tree, id, card);

  return (
    <PointMenu
      point={point}
      label={t("tree.cardMenu.label", { name })}
      title={name}
      onClose={onClose}
    >
      {!isRoot && (
        <DropdownMenuItem onClick={() => onCenter(id)}>{t("tree.centerTreeHere")}</DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => onOpenProfile(id)}>
        {t("tree.viewFullProfile")}
      </DropdownMenuItem>
      {options.load.length > 0 && <DropdownMenuSeparator />}
      {options.load.map((direction) => (
        <DropdownMenuItem key={direction} onClick={() => onExpand(id, direction)}>
          {direction === "up" ? t("tree.loadAncestors") : t("tree.loadDescendants")}
        </DropdownMenuItem>
      ))}
      {canEdit && <DropdownMenuSeparator />}
      {canEdit &&
        [...options.add, { kind: "spouse" as const }].map((option) => (
          <DropdownMenuItem key={option.kind} onClick={() => onAddRelative(id, option)}>
            {t("tree.addLabel", { kind: t(`tree.kind.${option.kind}`) })}
          </DropdownMenuItem>
        ))}
    </PointMenu>
  );
}

/**
 * The menu behind a card's "+" (editors): add a parent, sibling or child,
 * under the rules in `addOptions`. Where a person's parents or children
 * haven't been loaded yet, it offers loading them first — after which the
 * add items appear.
 */
function AddRelativeMenu({
  person,
  point,
  card,
  tree,
  onClose,
  onExpand,
  onAddRelative,
}: {
  person: TreePersonRow | undefined;
  point: ChartPoint;
  card: { canLoadParents: boolean; canLoadChildren: boolean } | undefined;
  tree: MergedTree;
  onClose: () => void;
  onExpand: (personId: string, direction: ExpandDirection) => void;
  onAddRelative: (subjectId: string, option: AddOption) => void;
}) {
  const { t } = useTranslation();
  if (!person) return null;
  const id = person.id;
  const name = formatPersonName(person);
  const options = addOptions(tree, id, card);
  const isEmpty = options.add.length === 0 && options.load.length === 0;

  return (
    <PointMenu
      point={point}
      label={t("tree.addMenu.label", { name })}
      title={name}
      onClose={onClose}
    >
      {options.add.map((option) => (
        <DropdownMenuItem key={option.kind} onClick={() => onAddRelative(id, option)}>
          {t("tree.addLabel", { kind: t(`tree.kind.${option.kind}`) })}
        </DropdownMenuItem>
      ))}
      {options.add.length > 0 && options.load.length > 0 && <DropdownMenuSeparator />}
      {options.load.map((direction) => (
        <DropdownMenuItem key={direction} onClick={() => onExpand(id, direction)}>
          {direction === "up"
            ? t("tree.addMenu.loadParentsFirst")
            : t("tree.addMenu.loadChildrenFirst")}
        </DropdownMenuItem>
      ))}
      {isEmpty && <DropdownMenuItem disabled>{t("tree.addMenu.nothing")}</DropdownMenuItem>}
    </PointMenu>
  );
}

/**
 * Jump to someone already loaded: filters `people` by name as you type
 * (ignoring case and accents, so "soren" finds "Søren") and hands the pick
 * to `onFind`. Only searches what's loaded — finding anyone in the whole
 * database is the person list's job.
 */
function FindInTree({
  people,
  onFind,
}: {
  people: readonly TreePersonRow[];
  onFind: (personId: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const needle = foldForSearch(query.trim());
  const matches =
    needle === ""
      ? []
      : people
          .filter((person) => foldForSearch(formatPersonName(person)).includes(needle))
          .slice(0, 12);

  return (
    <div className="relative w-56 rounded-md bg-card shadow-sm">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Combobox
        aria-label={t("tree.findInTree")}
        placeholder={t("tree.findInTree")}
        className="[&_input]:pl-6"
        items={matches}
        itemKey={(person) => person.id}
        itemLabel={formatPersonName}
        renderItem={formatPersonWithLifespan}
        inputValue={query}
        onInputValueChange={setQuery}
        onSelect={(person) => {
          onFind(person.id);
          setQuery("");
        }}
        emptyText={needle === "" ? undefined : t("person.family.noMatches")}
      />
    </div>
  );
}

/** Lower-case with accents and Nordic letters folded (ø→o, æ→ae, å→a), so search doesn't need them typed. */
function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .replaceAll("å", "a")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
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
                disabled={remove.isPending}
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
interface AddRelativeProps {
  subjectId: string;
  kind: AddRelativeKind;
  onAdded: (update: Partial<ExtraTreeData>) => void;
  /** People who can't be picked — e.g. existing siblings and parents, for a sibling. */
  excludeIds?: ReadonlySet<string>;
  siblingParentIds?: readonly string[];
  siblingParentsOnCanvas?: boolean;
}

/** The panel's "+ Add father" etc.: a button that opens `AddRelativeDialog`. Editors only. */
function AddRelativeButton(props: AddRelativeProps) {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  const [open, setOpen] = useState(false);
  // A plain dialog rather than a FormDialog, so ReadOnlyProvider can't hide it.
  if (!canEdit) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={() => setOpen(true)}
      >
        {t("tree.addLabel", { kind: t(`tree.kind.${props.kind}`) })}
      </Button>
      <AddRelativeDialog {...props} isOpen={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Controlled rather than trigger-based, so both the panel's button and the
 * card menu on the chart can open it.
 */
function AddRelativeDialog({
  subjectId,
  kind,
  onAdded,
  excludeIds,
  siblingParentIds = [],
  siblingParentsOnCanvas = false,
  isOpen,
  onOpenChange,
}: AddRelativeProps & { isOpen: boolean; onOpenChange: (isOpen: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const close = (next: boolean) => {
    onOpenChange(next);
  };

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
    close(false);
  };

  const createAndLink = async () => {
    const presetGender = kind === "father" ? "M" : kind === "mother" ? "F" : "U";
    const created = await createPersonMutation.mutateAsync({ data: { gender: presetGender } });
    // Only editors can create people, and editors see everyone unredacted.
    await link({ ...created, redacted: false });
  };

  if (!canEdit) return null;

  return (
    <Dialog open={isOpen} onOpenChange={close} title={t("tree.addTitle", { kind: kindLabel })}>
      <div className="space-y-3">
        <PersonPicker
          aria-label={t("tree.searchForKind", { kind: kindLabel })}
          onSelect={(person) => void link(person)}
          excludeIds={new Set([subjectId, ...(excludeIds ?? [])])}
        />
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={createPersonMutation.isPending}
          onClick={() => void createAndLink()}
        >
          {t("tree.createNewPerson")}
        </Button>
      </div>
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
            disabled={expandingDirection === "up"}
            onClick={() => onExpand("up")}
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
            disabled={expandingDirection === "down"}
            onClick={() => onExpand("down")}
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
