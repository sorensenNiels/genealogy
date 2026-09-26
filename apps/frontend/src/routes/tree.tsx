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
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { Network, UserRound, X } from "lucide-react";
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

export const Route = createFileRoute("/tree")({
  // No zod schema here (unlike the server functions this page calls) — a
  // malformed/missing personId just falls through to the "pick a person"
  // empty state below rather than needing its own error path.
  validateSearch: (search: Record<string, unknown>): { personId?: string } =>
    typeof search.personId === "string" ? { personId: search.personId } : {},
  component: TreePage,
});

type TreeData = Awaited<ReturnType<typeof getTree>>;
type TreePersonRow = TreeData["people"][number];
type TreeEdgeRow = TreeData["parentEdges"][number];
type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

function TreePage() {
  const { personId } = Route.useSearch();

  return (
    <div className="flex h-[calc(100vh-9.5rem)] flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Tree</h1>
        <p className="text-sm text-muted-foreground">
          Ancestors and descendants around one person, four generations either way.
        </p>
      </div>
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

interface PersonNodeData extends Record<string, unknown> {
  person: TreePersonRow;
  isRoot: boolean;
}
type PersonFlowNode = Node<PersonNodeData, "person">;

function PersonNode({ data }: NodeProps<PersonFlowNode>) {
  const { person, isRoot } = data;
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
          with a lineage line by the layout or by a reader. */}
      <Handle
        type="target"
        position={Position.Top}
        id="parent-in"
        className="bg-muted-foreground!"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="child-out"
        className="bg-muted-foreground!"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="spouse-in"
        className="bg-muted-foreground!"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="spouse-out"
        className="bg-muted-foreground!"
      />
      <Avatar className="size-9 shrink-0">
        {photoUrl && <AvatarImage src={photoUrl} alt="" />}
        <AvatarFallback className={genderTextClasses(person.gender)}>
          <UserRound className="size-5" aria-hidden="true" />
        </AvatarFallback>
      </Avatar>
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

  const [selectedId, setSelectedId] = useState<string | null>(null);

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
            data: { person, isRoot: person.id === data.rootId },
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
  const nodes = layout?.nodes ?? EMPTY_NODES;
  const edges = layout?.edges ?? EMPTY_EDGES;
  const selectedPerson = merged?.people.find((person) => person.id === selectedId) ?? null;

  return (
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
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="bg-card!" nodeColor="var(--muted)" />
        </ReactFlow>
      )}
      {merged && selectedPerson && (
        <DetailPanel
          person={selectedPerson}
          isRoot={selectedPerson.id === merged.rootId}
          tree={merged}
          onClose={() => setSelectedId(null)}
          onAdded={addToExtra}
          onExpand={(direction) => expandMutation.mutate({ nodeId: selectedPerson.id, direction })}
          expandingDirection={expandMutation.isPending ? expandMutation.variables?.direction : null}
        />
      )}
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
  onClose,
  onAdded,
  onExpand,
  expandingDirection,
}: {
  person: TreePersonRow;
  isRoot: boolean;
  tree: MergedTree;
  onClose: () => void;
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
    <div className="absolute inset-y-0 right-0 z-10 w-80 max-w-full overflow-y-auto border-l bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10 shrink-0">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className={genderTextClasses(person.gender)}>
              <UserRound className="size-5" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold">{formatPersonName(person)}</p>
            <p className="text-sm text-muted-foreground">{formatLifespan(person) ?? "—"}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onPress={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
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
