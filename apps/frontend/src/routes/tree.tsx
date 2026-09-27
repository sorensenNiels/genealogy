import { formatLifespan, formatPersonName, type Gender } from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@genealogy/ui/components/dialog";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Cross, Loader2, Network, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import "@xyflow/react/dist/style.css";

import { publicBackendUrl } from "../lib/env";
import { computeGenerations, layoutTree, NODE_WIDTH } from "../lib/tree-layout";
import {
  createPerson,
  getRelatives,
  getTree,
  linkParent,
  linkSpouse,
  listPersons,
} from "../server/functions/person.functions";
import { getMyProfile } from "../server/functions/profile.functions";

export const Route = createFileRoute("/tree")({
  // No zod schema here (unlike the server functions this page calls) — a
  // malformed/missing personId just falls through to the "pick a person"
  // empty state below rather than needing its own error path.
  validateSearch: (search: Record<string, unknown>): { personId?: string } =>
    typeof search.personId === "string" ? { personId: search.personId } : {},
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

type TreeData = Awaited<ReturnType<typeof getTree>>;
type TreePersonRow = TreeData["people"][number];
type TreeEdgeRow = TreeData["parentEdges"][number];
type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

function TreePage() {
  const { personId } = Route.useSearch();

  return (
    // No page title/subtitle here — the tree view is the whole page, and the
    // detail panel + canvas want every pixel of vertical space they can get.
    // `h-full` fills exactly what __root.tsx's <main> leaves available for
    // the /tree route (h-screen + flex-1 there, see isNoScrollPath) — no
    // guessing at the header's pixel height, and no page-level scrollbar.
    <div className="flex h-full flex-col gap-4">
      {personId ? <FamilyTree key={personId} rootId={personId} /> : <RootPicker />}
    </div>
  );
}

function RootPicker() {
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
        Pick a person to center their tree on — or open "View in tree" from a row in the{" "}
        <Link to="/people" className="underline hover:text-foreground">
          person list
        </Link>
        .
      </p>
      <Combobox<PersonListItem>
        aria-label="Search people"
        className="w-full max-w-sm"
        items={options}
        inputValue={query}
        onInputChange={setQuery}
        onChange={(value) => {
          if (typeof value !== "string") return;
          void navigate({ to: "/tree", search: { personId: value } });
        }}
      >
        <ComboboxInput placeholder="Search people…" />
        <ComboboxContent<PersonListItem>
          renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
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
  isRoot: boolean;
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

function PersonNode({ data }: NodeProps<PersonFlowNode>) {
  const { person, isRoot, canLoadAncestors, isLoadingAncestors, onLoadAncestors } = data;
  const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 overflow-hidden rounded-lg border bg-card p-3 pl-4 text-left shadow-sm",
        isRoot && "border-primary ring-2 ring-primary/40",
      )}
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
            title="Deceased"
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
          aria-label={`Center tree on ${formatPersonName(person)}`}
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
          aria-label={`Load ${formatPersonName(person)}'s ancestors`}
          title="Load ancestors"
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

const NODE_TYPES: NodeTypes = { person: PersonNode };

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
function mergeTree(base: TreeData, extra: ExtraTreeData): MergedTree {
  const peopleById = new Map(base.people.map((person) => [person.id, person]));
  for (const person of extra.people) peopleById.set(person.id, person);

  const parentEdgeKeys = new Set<string>();
  const parentEdges: TreeEdgeRow[] = [];
  for (const edge of [...base.parentEdges, ...extra.parentEdges]) {
    const key = `${edge.parentId}->${edge.childId}`;
    if (parentEdgeKeys.has(key)) continue;
    parentEdgeKeys.add(key);
    parentEdges.push(edge);
  }

  const spouseEdgeKeys = new Set<string>();
  const spouseEdges: Array<[string, string]> = [];
  for (const pair of [...base.spouseEdges, ...extra.spouseEdges]) {
    const key = pair.toSorted().join("|");
    if (spouseEdgeKeys.has(key)) continue;
    spouseEdgeKeys.add(key);
    spouseEdges.push(pair);
  }

  return {
    rootId: base.rootId,
    people: [...peopleById.values()],
    parentEdges,
    spouseEdges,
    parentsKnownIds: new Set([...base.parentsKnownIds, ...extra.parentsKnownIds]),
    childrenKnownIds: new Set([...base.childrenKnownIds, ...extra.childrenKnownIds]),
  };
}

function FamilyTree({ rootId }: { rootId: string }) {
  const treeQuery = useQuery({
    queryKey: ["person", "tree", rootId],
    queryFn: () => getTree({ data: { id: rootId } }),
  });

  const [extra, setExtra] = useState<ExtraTreeData>(EMPTY_EXTRA);
  const addToExtra = (update: Partial<ExtraTreeData>) => {
    setExtra((previous) => ({
      people: [...previous.people, ...(update.people ?? [])],
      parentEdges: [...previous.parentEdges, ...(update.parentEdges ?? [])],
      spouseEdges: [...previous.spouseEdges, ...(update.spouseEdges ?? [])],
      parentsKnownIds: [...previous.parentsKnownIds, ...(update.parentsKnownIds ?? [])],
      childrenKnownIds: [...previous.childrenKnownIds, ...(update.childrenKnownIds ?? [])],
    }));
  };

  // Memoized so its identity is stable across unrelated re-renders (the
  // `isArranging` check below compares against this reference) and only
  // actually changes when the data it's built from does.
  const merged = useMemo(
    () => (treeQuery.data ? mergeTree(treeQuery.data, extra) : null),
    [treeQuery.data, extra],
  );

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
    nodes: PersonFlowNode[];
    edges: Edge[];
  } | null>(null);

  // Re-run whenever the merged tree data changes (a new root, a refetch, an
  // expand, or an add-relative); elk's layout is async, so this can't be a
  // plain render-time computation.
  useEffect(() => {
    const data = merged;
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
      const nodes = data.people.flatMap((person) => {
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
              canLoadAncestors: false,
              isLoadingAncestors: false,
              onLoadAncestors: () => {},
            },
            draggable: false,
          },
        ];
      });
      const edges: Edge[] = [
        ...data.parentEdges.map((edge) => ({
          id: `parent-${edge.parentId}-${edge.childId}`,
          source: edge.parentId,
          sourceHandle: "child-out",
          target: edge.childId,
          targetHandle: "parent-in",
          type: "smoothstep",
        })),
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
  }, [merged]);

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
  const nodes = useMemo<PersonFlowNode[]>(() => {
    const base = layout?.nodes ?? EMPTY_NODES;
    if (!merged) return base;
    return base.map((node) => {
      const data: PersonNodeData = Object.assign({}, node.data, {
        canLoadAncestors: !merged.parentsKnownIds.has(node.id),
        isLoadingAncestors:
          expandMutation.isPending &&
          expandMutation.variables?.nodeId === node.id &&
          expandMutation.variables?.direction === "up",
        onLoadAncestors: () => expandMutation.mutate({ nodeId: node.id, direction: "up" }),
      });
      return Object.assign({}, node, { data });
    });
  }, [layout, merged, expandMutation]);

  if (treeQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (treeQuery.isError) {
    return (
      <p className="text-sm text-destructive">Could not load tree: {treeQuery.error.message}</p>
    );
  }

  const isArranging = !layout || layout.data !== merged;
  const edges = layout?.edges ?? EMPTY_EDGES;
  const selectedPerson = merged?.people.find((person) => person.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {merged && selectedPerson && (
        <DetailPanel
          person={selectedPerson}
          isRoot={selectedPerson.id === merged.rootId}
          tree={merged}
          onAdded={addToExtra}
          onExpand={(direction) => expandMutation.mutate({ nodeId: selectedPerson.id, direction })}
          expandingDirection={expandMutation.isPending ? expandMutation.variables?.direction : null}
        />
      )}
      <div className="relative flex-1 overflow-hidden rounded-lg border">
        {isArranging ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Arranging tree…
          </div>
        ) : (
          <ReactFlow
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
            onNodeClick={(_, node) => setSelectedId(node.id)}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

function RelativeRow({ label, person }: { label?: string; person: TreePersonRow }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        {label && <p className="text-xs text-muted-foreground">{label}</p>}
        <Link
          to="/people/$personId"
          params={{ personId: person.id }}
          className="truncate hover:underline"
        >
          {formatPersonName(person)}
        </Link>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatLifespan(person) ?? ""}</span>
    </div>
  );
}

type AddRelativeKind = "father" | "mother" | "spouse" | "child";

/**
 * Search for an existing person to link, or create a blank one on the spot —
 * mirroring the person page's own "add relative" dialogs, but deliberately
 * without their full create-with-details form: a blank record plus a link is
 * enough from the tree canvas, and "View full profile" in the panel is one
 * click away to fill in a name afterward. Full parentage-type choice (step/
 * adopted/etc.) also stays on the person page — this only ever links "birth".
 */
function AddRelativeButton({
  subjectId,
  kind,
  onAdded,
}: {
  subjectId: string;
  kind: AddRelativeKind;
  onAdded: (update: Partial<ExtraTreeData>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open,
  });
  const options = (search.data?.items ?? []).filter((candidate) => candidate.id !== subjectId);

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
    setOpen(false);
    setQuery("");
  };

  const createAndLink = async () => {
    const presetGender = kind === "father" ? "M" : kind === "mother" ? "F" : "U";
    const created = await createPersonMutation.mutateAsync({ data: { gender: presetGender } });
    await link(created);
  };

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Button variant="outline" size="sm" className="w-full justify-start">
        + Add {kind}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {kind}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Combobox<PersonListItem>
            aria-label={`Search for ${kind}`}
            items={options}
            inputValue={query}
            onInputChange={setQuery}
            onChange={(value) => {
              const target = options.find((candidate) => candidate.id === value);
              if (target) void link(target);
            }}
          >
            <ComboboxInput placeholder="Search people…" />
            <ComboboxContent<PersonListItem>
              renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
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
            + Create new person
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
  onAdded,
  onExpand,
  expandingDirection,
}: {
  person: TreePersonRow;
  isRoot: boolean;
  tree: MergedTree;
  onAdded: (update: Partial<ExtraTreeData>) => void;
  onExpand: (direction: "up" | "down") => void;
  expandingDirection: "up" | "down" | null | undefined;
}) {
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
              title="Deceased"
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
          View full profile
        </Link>
        {!isRoot && (
          <Link
            to="/tree"
            search={{ personId: person.id }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Center tree here
          </Link>
        )}
      </div>

      <section className="mt-6 space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">Parents</h3>
        {father && <RelativeRow label="Father" person={father} />}
        {!father && parentsKnown && (
          <AddRelativeButton subjectId={person.id} kind="father" onAdded={onAdded} />
        )}
        {mother && <RelativeRow label="Mother" person={mother} />}
        {!mother && parentsKnown && (
          <AddRelativeButton subjectId={person.id} kind="mother" onAdded={onAdded} />
        )}
        {otherParents.map((parent) => (
          <RelativeRow key={parent.id} person={parent} />
        ))}
        {!parentsKnown && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            isDisabled={expandingDirection === "up"}
            onPress={() => onExpand("up")}
          >
            {expandingDirection === "up" ? "Loading…" : "Load ancestors"}
          </Button>
        )}
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">Spouses</h3>
        {spouses.map((spouse) => (
          <RelativeRow key={spouse.id} person={spouse} />
        ))}
        <AddRelativeButton subjectId={person.id} kind="spouse" onAdded={onAdded} />
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">Children</h3>
        {children.map((child) => (
          <RelativeRow key={child.id} person={child} />
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
            {expandingDirection === "down" ? "Loading…" : "Load descendants"}
          </Button>
        )}
      </section>
    </div>
  );
}

// Stable references so a still-arranging render doesn't hand React Flow a
// fresh empty array every time.
const EMPTY_NODES: PersonFlowNode[] = [];
const EMPTY_EDGES: Edge[] = [];
