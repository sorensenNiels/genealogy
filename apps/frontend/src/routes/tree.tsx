import { formatLifespan, formatPersonName, type Gender } from "@genealogy/core";
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
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  Background,
  Controls,
  Handle,
  NodeToolbar,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { Cross, Loader2, Network, UserRound, XIcon } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "@xyflow/react/dist/style.css";

import { useTranslation } from "react-i18next";

import { publicBackendUrl } from "../lib/env";
import { usePermissions } from "../lib/permissions";
import { computeGenerations, layoutTree, NODE_HEIGHT, NODE_WIDTH } from "../lib/tree-layout";
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

export const Route = createFileRoute("/tree")({
  // No zod schema here (unlike the server functions this page calls) — a
  // malformed/missing personId just falls through to the "pick a person"
  // empty state below rather than needing its own error path.
  // `view` is left out of the URL for the default "both", so existing links
  // (the People list's "View in tree", ...) need no change.
  validateSearch: (search: Record<string, unknown>): { personId?: string; view?: TreeView } => ({
    ...(typeof search.personId === "string" ? { personId: search.personId } : {}),
    ...(search.view === "ancestors" || search.view === "descendants" ? { view: search.view } : {}),
  }),
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

/** Which side of the centered person the canvas draws — see `filterByView`. */
type TreeView = "both" | "ancestors" | "descendants";

type TreeData = Awaited<ReturnType<typeof getTree>>;
type TreePersonRow = TreeData["people"][number];
type TreeEdgeRow = TreeData["parentEdges"][number];
type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

function TreePage() {
  const { personId, view = "both" } = Route.useSearch();

  return (
    // No page title/subtitle here — the tree view is the whole page, and the
    // detail panel + canvas want every pixel of vertical space they can get.
    // `h-full` fills exactly what __root.tsx's <main> leaves available for
    // the /tree route (h-screen + flex-1 there, see isNoScrollPath) — no
    // guessing at the header's pixel height, and no page-level scrollbar.
    <div className="flex h-full flex-col gap-4">
      {personId ? <FamilyTree key={personId} rootId={personId} view={view} /> : <RootPicker />}
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

/** A thin colored strip on the card, the same idea as a gender-coded pin on a map marker. */
function genderAccentClasses(gender: Gender): string {
  if (gender === "M") return "bg-sky-400 dark:bg-sky-500";
  if (gender === "F") return "bg-rose-400 dark:bg-rose-500";
  return "bg-slate-300 dark:bg-slate-600";
}

function genderTextClasses(gender: Gender): string {
  if (gender === "M") return "text-sky-600 dark:text-sky-400";
  if (gender === "F") return "text-rose-600 dark:text-rose-400";
  return "text-slate-500 dark:text-slate-400";
}

/**
 * A tiny two-parent pictogram (blue block — connector — pink block) for the
 * "ancestors can be loaded" badge, reusing the same gender-accent colors as
 * `genderAccentClasses` rather than introducing a new palette. No single
 * lucide-react icon reads as "parents", so this is a small inline SVG.
 */
function ParentsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 10" className={className} aria-hidden="true">
      <rect x="0" y="1" width="6" height="8" rx="1.5" className="fill-sky-400 dark:fill-sky-500" />
      <rect x="6" y="4" width="4" height="2" className="fill-muted-foreground" />
      <rect
        x="10"
        y="1"
        width="6"
        height="8"
        rx="1.5"
        className="fill-rose-400 dark:fill-rose-500"
      />
    </svg>
  );
}

interface PersonNodeData extends Record<string, unknown> {
  person: TreePersonRow;
  /** The person the tree is centred on — the strong highlight. Double-click another card to centre on them. */
  isRoot: boolean;
  /** Shown in the side panel (single click) — a lighter outline, so it's distinct from the centre. */
  isSelected: boolean;
  // Whether this person's parents haven't been fetched yet (tree.parentsKnownIds) — same
  // condition DetailPanel's own "Load ancestors" button already gates on, just
  // surfaced directly on the card so a viewer doesn't need to select the node
  // first. Recomputed on every render from live data (see the `nodes` memo in
  // FamilyTree), not baked into the async elk layout snapshot.
  canLoadAncestors: boolean;
  isLoadingAncestors: boolean;
  onLoadAncestors: () => void;
}
type PersonFlowNode = Node<PersonNodeData, "person">;
/** A couple's id for its union point — the same whichever partner comes first. */
function coupleKey(a: string, b: string): string {
  return [a, b].toSorted().join("|");
}

/**
 * An invisible point in the middle of a couple's marriage line — the one
 * place their shared children's lines start from, the usual genealogy-chart
 * shape, instead of a line from each parent crossing under the couple.
 */
type UnionFlowNode = Node<Record<string, never>, "union">;
type FlowNode = PersonFlowNode | UnionFlowNode;

function PersonNode({ data }: NodeProps<PersonFlowNode>) {
  const { t } = useTranslation();
  const { person, isRoot, isSelected, canLoadAncestors, isLoadingAncestors, onLoadAncestors } =
    data;
  const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 overflow-hidden rounded-lg border bg-card p-3 pl-4 text-left shadow-sm",
        isRoot && "border-primary ring-2 ring-primary/40",
        isSelected && !isRoot && "border-foreground/40 ring-2 ring-foreground/15",
      )}
      // Double-click centres the tree here (see onNodeDoubleClick in FamilyTree).
      title={isRoot ? undefined : t("tree.doubleClickToCenter")}
      style={{ width: NODE_WIDTH }}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1.5", genderAccentClasses(person.gender))} />
      {/* Parent/child edges use the top/bottom handles; spouse edges use
          left/right (see FamilyTree) so a marriage line never gets confused
          with a lineage line by the layout or by a reader. Invisible
          (opacity-0, pointer-events-none) rather than removed: React Flow
          still needs each one mounted at its position to anchor an edge
          there, but with nodesConnectable={false} they're no longer a
          draggable affordance, so a visible dot would just be a UI promise
          the card doesn't keep. */}
      <Handle
        type="target"
        position={Position.Top}
        id="parent-in"
        className="pointer-events-none! opacity-0!"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="child-out"
        className="pointer-events-none! opacity-0!"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="spouse-in"
        className="pointer-events-none! opacity-0!"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="spouse-out"
        className="pointer-events-none! opacity-0!"
      />
      <div className="relative shrink-0">
        <Avatar className="size-9">
          {photoUrl && <AvatarImage src={photoUrl} alt="" />}
          <AvatarFallback className={genderTextClasses(person.gender)}>
            <UserRound className="size-5" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        {/* Same corner-badge pattern as an online-status dot, just deceased
            instead of presence — the border matches the card's own so the
            badge reads as cut out of the avatar rather than pasted on top. */}
        {!person.isLiving && (
          <span
            className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-muted-foreground"
            title={t("tree.deceased")}
          >
            <Cross className="size-2.5 text-card" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{formatPersonName(person)}</p>
        <p className="truncate text-xs text-muted-foreground">{formatLifespan(person) ?? "—"}</p>
      </div>
      {!isRoot && (
        <Link
          to="/tree"
          search={{ personId: person.id }}
          onClick={(event) => event.stopPropagation()}
          aria-label={t("tree.centerTreeOn", { name: formatPersonName(person) })}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Network className="size-4" />
        </Link>
      )}
      {/* NodeToolbar renders through a portal outside this card's own DOM —
          unlike an absolutely-positioned child, it's never clipped by the
          card's own `overflow-hidden` (needed for the gender-accent bar's
          rounded corners), so a badge straddling the top-right border stays
          fully visible instead of getting cut off at the corner. */}
      <NodeToolbar
        isVisible={canLoadAncestors}
        position={Position.Top}
        align="end"
        offset={-8}
        className="border-none! bg-transparent! p-0! shadow-none!"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onLoadAncestors();
          }}
          disabled={isLoadingAncestors}
          aria-label={t("tree.loadAncestorsOf", { name: formatPersonName(person) })}
          title={t("tree.loadAncestors")}
          className="flex size-5 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {isLoadingAncestors ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <ParentsIcon className="size-3" />
          )}
        </button>
      </NodeToolbar>
    </div>
  );
}

function UnionNode() {
  return (
    <div className="size-px" aria-hidden="true">
      <Handle
        type="source"
        position={Position.Bottom}
        id="family-out"
        isConnectable={false}
        className="opacity-0"
      />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { person: PersonNode, union: UnionNode };

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
 * in the panel, a removed parent and everyone above them would otherwise
 * stay on the canvas with no generation to place them in (`computeGenerations`
 * floods from the root, so they'd all pile onto the root's own row).
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

/**
 * What the canvas draws for each `TreeView`. "ancestors" is the direct line
 * upward only — a pedigree, so not even the root's own spouse. "descendants"
 * is everyone below plus each of their partners, the usual shape of a
 * descendant chart. The panel keeps working off the full tree either way.
 */
function filterByView(tree: MergedTree, view: TreeView): MergedTree {
  if (view === "both") return tree;
  if (view === "ancestors") {
    const ids = reachable([tree.rootId], (id) =>
      tree.parentEdges.filter((edge) => edge.childId === id).map((edge) => edge.parentId),
    );
    return restrictTo(tree, ids);
  }
  const descendants = reachable([tree.rootId], (id) =>
    tree.parentEdges.filter((edge) => edge.parentId === id).map((edge) => edge.childId),
  );
  const ids = new Set(descendants);
  for (const [a, b] of tree.spouseEdges) {
    if (descendants.has(a)) ids.add(b);
    if (descendants.has(b)) ids.add(a);
  }
  return restrictTo(tree, ids);
}

function FamilyTree({ rootId, view }: { rootId: string; view: TreeView }) {
  const { t } = useTranslation();
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

  // Memoized so its identity is stable across unrelated re-renders (the
  // `isArranging` check below compares against this reference) and only
  // actually changes when the data it's built from does. `merged` is the
  // whole tree (what the panel reads); `visible` is what the canvas draws.
  const merged = useMemo(
    () => (treeQuery.data ? mergeTree(treeQuery.data, extra, removed) : null),
    [treeQuery.data, extra, removed],
  );
  const visible = useMemo(() => (merged ? filterByView(merged, view) : null), [merged, view]);

  // Defaults to the root rather than nobody, so the detail panel is already
  // populated with the person the tree is centered on instead of an empty
  // canvas that needs a click before showing anything. `FamilyTree` is keyed
  // by `rootId` in TreePage, so this re-initializes whenever the centered
  // person changes.
  // Never null once a tree has loaded — the panel always has a person to
  // show, so there's no close/deselect action, only ever switching who's
  // shown (see onNodeClick below; there's no onPaneClick deselect either).
  const [selectedId, setSelectedId] = useState<string>(rootId);

  // Keyed by the merged data it was computed from, so `isArranging` below can
  // be derived (data changed but the matching layout hasn't landed yet)
  // instead of tracked as its own state set synchronously inside the effect.
  const [layout, setLayout] = useState<{
    data: MergedTree;
    nodes: FlowNode[];
    edges: Edge[];
  } | null>(null);

  // Re-run whenever the merged tree data changes (a new root, a refetch, an
  // expand, or an add-relative); elk's layout is async, so this can't be a
  // plain render-time computation.
  useEffect(() => {
    const data = visible;
    if (!data) return undefined;
    let cancelled = false;

    const generations = computeGenerations(data.rootId, data.parentEdges, data.spouseEdges);
    void layoutTree(
      data.people.map((person) => person.id),
      data.parentEdges,
      data.spouseEdges,
      generations,
      data.rootId,
    ).then((positions) => {
      if (cancelled) return;
      const nodes: FlowNode[] = data.people.flatMap((person) => {
        const position = positions.get(person.id);
        if (!position) return [];
        return [
          {
            id: person.id,
            type: "person" as const,
            position,
            // canLoadAncestors/isLoadingAncestors/onLoadAncestors are
            // placeholders here — the `nodes` memo in FamilyTree overlays
            // the live values onto every render, since those depend on
            // expandMutation's pending state, not on this layout snapshot.
            data: {
              person,
              isRoot: person.id === data.rootId,
              isSelected: false,
              canLoadAncestors: false,
              isLoadingAncestors: false,
              onLoadAncestors: () => {},
            },
            draggable: false,
          },
        ];
      });
      // A couple on one row gets a union point in the middle of their
      // marriage line (layoutTree keeps partners side by side).
      const unionPoints = new Map<string, { x: number; y: number }>();
      for (const [a, b] of data.spouseEdges) {
        const posA = positions.get(a);
        const posB = positions.get(b);
        if (!posA || !posB || posA.y !== posB.y) continue;
        const [left, right] = posA.x <= posB.x ? [posA, posB] : [posB, posA];
        unionPoints.set(coupleKey(a, b), {
          x: (left.x + NODE_WIDTH + right.x) / 2,
          y: left.y + NODE_HEIGHT / 2,
        });
      }
      // Each child hangs from their parents' union point when two of their
      // parents are such a couple; any other parent (a lone parent, a third
      // adoptive one) keeps a direct line.
      const usedUnions = new Set<string>();
      const lineageEdges: Edge[] = [];
      const parentsByChild = new Map<string, string[]>();
      for (const edge of data.parentEdges) {
        parentsByChild.set(edge.childId, [
          ...(parentsByChild.get(edge.childId) ?? []),
          edge.parentId,
        ]);
      }
      for (const [childId, parentIds] of parentsByChild) {
        let remaining = parentIds;
        const pair = parentIds
          .flatMap((a, i) => parentIds.slice(i + 1).map((b) => [a, b] as const))
          .find(([a, b]) => unionPoints.has(coupleKey(a, b)));
        if (pair) {
          const key = coupleKey(pair[0], pair[1]);
          usedUnions.add(key);
          lineageEdges.push({
            id: `family-${key}-${childId}`,
            source: `union-${key}`,
            sourceHandle: "family-out",
            target: childId,
            targetHandle: "parent-in",
            type: "smoothstep",
          });
          remaining = parentIds.filter((id) => id !== pair[0] && id !== pair[1]);
        }
        for (const parentId of remaining) {
          lineageEdges.push({
            id: `parent-${parentId}-${childId}`,
            source: parentId,
            sourceHandle: "child-out",
            target: childId,
            targetHandle: "parent-in",
            type: "smoothstep",
          });
        }
      }
      for (const key of usedUnions) {
        nodes.push({
          id: `union-${key}`,
          type: "union",
          position: unionPoints.get(key)!,
          data: {},
          draggable: false,
          selectable: false,
          focusable: false,
        });
      }
      const edges: Edge[] = [
        ...lineageEdges,
        // A marriage line is short and solid, routed through dedicated
        // left/right handles rather than the top/bottom ones lineage edges
        // use — connected left-partner → right-partner so it's always the
        // short straight segment between two adjacent cards, never a line
        // crossing the canvas (see layoutTree: spouses are always placed
        // adjacent on the same row).
        ...data.spouseEdges.map(([a, b]) => {
          const posA = positions.get(a);
          const posB = positions.get(b);
          const [leftId, rightId] = (posA?.x ?? 0) <= (posB?.x ?? 0) ? [a, b] : [b, a];
          return {
            id: `spouse-${a}-${b}`,
            source: leftId,
            sourceHandle: "spouse-out",
            target: rightId,
            targetHandle: "spouse-in",
            type: "straight",
            style: { strokeWidth: 2 },
          };
        }),
      ];
      setLayout({ data, nodes, edges });
      return undefined;
    });

    return () => {
      cancelled = true;
    };
  }, [visible]);

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

  // Overlaid onto the elk-computed layout snapshot at render time, not baked
  // into it — `layout` only recomputes when `merged` changes (a new root,
  // expand, or add-relative), but whether a node "can load ancestors" and
  // whether it's mid-expand needs to update live with `merged` (parentsKnownIds
  // changing) and with expandMutation's own pending state, without forcing a
  // full elk relayout on every mutation state change.
  const nodes = useMemo<FlowNode[]>(() => {
    const base = layout?.nodes ?? EMPTY_NODES;
    if (!merged) return base;
    return base.map((node) => {
      if (node.type !== "person") return node;
      const data: PersonNodeData = Object.assign({}, node.data, {
        isSelected: node.id === selectedId,
        // In the descendants view, loaded ancestors couldn't be drawn anyway.
        canLoadAncestors: view !== "descendants" && !merged.parentsKnownIds.has(node.id),
        isLoadingAncestors:
          expandMutation.isPending &&
          expandMutation.variables?.nodeId === node.id &&
          expandMutation.variables?.direction === "up",
        onLoadAncestors: () => expandMutation.mutate({ nodeId: node.id, direction: "up" }),
      });
      return Object.assign({}, node, { data });
    });
  }, [layout, merged, view, expandMutation, selectedId]);

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

  const isArranging = !layout || layout.data !== visible;
  const edges = layout?.edges ?? EMPTY_EDGES;
  // Falls back to the root when the selected person is no longer drawn —
  // hidden by the view toggle, or disconnected by a removal.
  const selectedPerson =
    visible?.people.find((person) => person.id === selectedId) ??
    visible?.people.find((person) => person.id === rootId) ??
    null;

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {merged && selectedPerson && (
        <ReadOnlyProvider readOnly={!canEdit}>
          <DetailPanel
            person={selectedPerson}
            isRoot={selectedPerson.id === merged.rootId}
            tree={merged}
            view={view}
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
        <div className="absolute top-3 left-3 z-10 rounded-md bg-card shadow-sm">
          <ButtonRadioGroup
            aria-label={t("tree.view.label")}
            value={view}
            onChange={(next) =>
              void navigate({
                to: "/tree",
                search: { personId: rootId, ...(next === "both" ? {} : { view: next }) },
              })
            }
            options={[
              { value: "both", label: t("tree.view.both") },
              { value: "ancestors", label: t("tree.view.ancestors") },
              { value: "descendants", label: t("tree.view.descendants") },
            ]}
          />
        </div>
        {isArranging ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("tree.arrangingTree")}
          </div>
        ) : (
          <ReactFlow
            style={CANVAS_THEME}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            nodesDraggable={false}
            // The handles on PersonNode exist only so React Flow can route
            // parent/spouse edges to a specific side of the card — they were
            // never meant to be draggable by a viewer to freehand a new
            // relationship (there's no onConnect handler, so a drag would
            // just show the connection line and then silently do nothing).
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.1}
            defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
            onNodeClick={(_, node) => {
              if (node.type === "person") setSelectedId(node.id);
            }}
            // Double-click a person to centre the tree on them — the same as
            // "Center tree here" in the panel, keeping the current view.
            // React Flow's own double-click zoom would fire too, so it's off.
            zoomOnDoubleClick={false}
            onNodeDoubleClick={(_, node) => {
              if (node.type !== "person" || node.id === rootId) return;
              void navigate({
                to: "/tree",
                search: { personId: node.id, ...(view === "both" ? {} : { view }) },
              });
            }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
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
  view,
  onAdded,
  onRemoved,
  onExpand,
  expandingDirection,
}: {
  person: TreePersonRow;
  isRoot: boolean;
  tree: MergedTree;
  view: TreeView;
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
            search={{ personId: person.id, ...(view === "both" ? {} : { view }) }}
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

/**
 * Points React Flow's zoom controls at the app's own theme tokens, so they
 * follow light/dark with everything else. Its defaults are a near-white
 * button whose icon *inherits* the surrounding text color — in dark mode
 * that's light text on a white button, a blank white box. Its own
 * `colorMode="dark"` isn't the fix: it also redraws every connecting line in
 * #3e3e3e on #141414, which is barely visible. The lines and transparent
 * canvas background stay on React Flow's light defaults, which read fine on
 * both themes.
 */
const CANVAS_THEME = {
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--accent)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-color-hover": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
} as CSSProperties;

// Stable references so a still-arranging render doesn't hand React Flow a
// fresh empty array every time.
const EMPTY_NODES: FlowNode[] = [];
const EMPTY_EDGES: Edge[] = [];
