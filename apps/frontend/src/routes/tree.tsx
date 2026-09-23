import { formatLifespan, formatPersonName } from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import { cn } from "@genealogy/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
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
import { Network } from "lucide-react";
import { useEffect, useState } from "react";

import "@xyflow/react/dist/style.css";

import { publicBackendUrl } from "../lib/env";
import { initials } from "../lib/person-display";
import { computeGenerations, layoutTree, NODE_WIDTH } from "../lib/tree-layout";
import { getTree, listPersons } from "../server/functions/person.functions";

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
        "flex items-center gap-2 rounded-lg border bg-card p-3 text-left shadow-sm",
        isRoot && "border-primary ring-2 ring-primary/40",
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Top} className="bg-muted-foreground!" />
      <Avatar className="size-9 shrink-0">
        {photoUrl && <AvatarImage src={photoUrl} alt="" />}
        <AvatarFallback className="text-xs">{initials(person)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <Link
          to="/people/$personId"
          params={{ personId: person.id }}
          className="block truncate text-sm font-medium hover:underline"
        >
          {formatPersonName(person)}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{formatLifespan(person) ?? "—"}</p>
      </div>
      {!isRoot && (
        <Link
          to="/tree"
          search={{ personId: person.id }}
          aria-label={`Center tree on ${formatPersonName(person)}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Network className="size-4" />
        </Link>
      )}
      <Handle type="source" position={Position.Bottom} className="bg-muted-foreground!" />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { person: PersonNode };

function FamilyTree({ rootId }: { rootId: string }) {
  const treeQuery = useQuery({
    queryKey: ["person", "tree", rootId],
    queryFn: () => getTree({ data: { id: rootId } }),
  });

  // Keyed by the tree data it was computed from, so `isArranging` below can be
  // derived (data changed but the matching layout hasn't landed yet) instead
  // of tracked as its own state set synchronously inside the effect.
  const [layout, setLayout] = useState<{
    data: TreeData;
    nodes: PersonFlowNode[];
    edges: Edge[];
  } | null>(null);

  // Re-run whenever the fetched tree data changes (a new root, or a refetch);
  // elk's layout is async, so this can't be a plain render-time computation.
  useEffect(() => {
    const data = treeQuery.data;
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
      const edges = [
        ...data.parentEdges.map((edge) => ({
          id: `parent-${edge.parentId}-${edge.childId}`,
          source: edge.parentId,
          target: edge.childId,
          type: "smoothstep",
        })),
        ...data.spouseEdges.map(([a, b]) => ({
          id: `spouse-${a}-${b}`,
          source: a,
          target: b,
          type: "straight",
          style: { strokeDasharray: "4 4" },
        })),
      ];
      setLayout({ data, nodes, edges });
      return undefined;
    });

    return () => {
      cancelled = true;
    };
  }, [treeQuery.data]);

  const isArranging = layout?.data !== treeQuery.data;
  const nodes = layout?.nodes ?? EMPTY_NODES;
  const edges = layout?.edges ?? EMPTY_EDGES;

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

  return (
    <div className="flex-1 rounded-lg border">
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
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="bg-card!" nodeColor="var(--muted)" />
        </ReactFlow>
      )}
    </div>
  );
}

// Stable references so a still-arranging render doesn't hand React Flow a
// fresh empty array every time.
const EMPTY_NODES: PersonFlowNode[] = [];
const EMPTY_EDGES: Edge[] = [];
