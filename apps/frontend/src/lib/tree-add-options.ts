/** The bits of the merged tree these rules read — see `MergedTree` in `routes/tree.tsx`. */
export interface AddOptionsTree {
  people: ReadonlyArray<{ id: string; gender: string }>;
  parentEdges: ReadonlyArray<{ parentId: string; childId: string; parentage: string }>;
  parentsKnownIds: ReadonlySet<string>;
  childrenKnownIds: ReadonlySet<string>;
}

export type AddRelativeKind = "father" | "mother" | "spouse" | "child" | "sibling";
export type ExpandDirection = "up" | "down";

/** The birth parent of this gender — the "Father"/"Mother" slot the panel shows. */
export function birthParent(tree: AddOptionsTree, personId: string, gender: "M" | "F") {
  return tree.parentEdges.find(
    (edge) =>
      edge.childId === personId &&
      edge.parentage === "birth" &&
      tree.people.find((person) => person.id === edge.parentId)?.gender === gender,
  );
}

/** One way to add a relative from the chart — what `AddRelativeDialog` needs beyond the person. */
export interface AddOption {
  kind: AddRelativeKind;
  /** For a sibling: the birth parents they'll share, and who can't be picked (existing siblings and those parents). */
  siblingParentIds?: string[];
  excludeIds?: ReadonlySet<string>;
}

/**
 * What can be added for a person from the chart, under the same rules as
 * the panel, so the chart never offers what would make a duplicate: a
 * father/mother only when we know that slot is empty (their parents have
 * been loaded), a child only once their children have been loaded, and a
 * sibling only when a birth parent is known — a sibling is added as a
 * child of the same birth parents. Where we haven't looked yet, `load`
 * says what to load first instead.
 */
export function addOptions(
  tree: AddOptionsTree,
  personId: string,
  card: { canLoadParents: boolean; canLoadChildren: boolean } | undefined,
): { add: AddOption[]; load: ExpandDirection[] } {
  const parentsKnown = tree.parentsKnownIds.has(personId);
  const childrenKnown = tree.childrenKnownIds.has(personId);
  const birthParentIds = tree.parentEdges
    .filter((edge) => edge.childId === personId && edge.parentage === "birth")
    .map((edge) => edge.parentId);
  const siblingIds = tree.parentEdges
    .filter((edge) => birthParentIds.includes(edge.parentId) && edge.childId !== personId)
    .map((edge) => edge.childId);

  const add: AddOption[] = [];
  if (parentsKnown && !birthParent(tree, personId, "M")) add.push({ kind: "father" });
  if (parentsKnown && !birthParent(tree, personId, "F")) add.push({ kind: "mother" });
  if (birthParentIds.length > 0) {
    add.push({
      kind: "sibling",
      siblingParentIds: birthParentIds,
      excludeIds: new Set([...siblingIds, ...birthParentIds]),
    });
  }
  if (childrenKnown) add.push({ kind: "child" });

  const load: ExpandDirection[] = [
    ...(card?.canLoadParents ? (["up"] as const) : []),
    ...(card?.canLoadChildren ? (["down"] as const) : []),
  ];
  return { add, load };
}
