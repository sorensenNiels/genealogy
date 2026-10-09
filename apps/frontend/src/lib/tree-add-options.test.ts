import { describe, expect, it } from "vitest";

import { addOptions, type AddOptionsTree } from "./tree-add-options";

const people = [
  { id: "dad", gender: "M" },
  { id: "mum", gender: "F" },
  { id: "me", gender: "U" },
  { id: "sis", gender: "F" },
  { id: "lone", gender: "U" },
];

function tree(overrides: Partial<AddOptionsTree> = {}): AddOptionsTree {
  return {
    people,
    parentEdges: [
      { parentId: "dad", childId: "me", parentage: "birth" },
      { parentId: "mum", childId: "me", parentage: "birth" },
      { parentId: "dad", childId: "sis", parentage: "birth" },
      { parentId: "mum", childId: "sis", parentage: "birth" },
    ],
    parentsKnownIds: new Set(["me", "sis", "lone"]),
    childrenKnownIds: new Set(["dad", "mum"]),
    ...overrides,
  };
}

const nothingToLoad = { canLoadParents: false, canLoadChildren: false };

describe("addOptions", () => {
  it("offers a sibling sharing the birth parents, but no parent slot that's filled", () => {
    const { add } = addOptions(tree(), "me", nothingToLoad);
    expect(add.map((option) => option.kind)).toEqual(["sibling"]);
    expect(add[0]).toMatchObject({ siblingParentIds: ["dad", "mum"] });
    expect(add[0]?.excludeIds).toEqual(new Set(["sis", "dad", "mum"]));
  });

  it("offers both parents for someone whose parents were looked up and are missing", () => {
    expect(addOptions(tree(), "lone", nothingToLoad).add.map((option) => option.kind)).toEqual([
      "father",
      "mother",
    ]);
  });

  it("offers only the missing parent", () => {
    const oneParent = tree({
      parentEdges: [{ parentId: "mum", childId: "me", parentage: "birth" }],
    });
    expect(addOptions(oneParent, "me", nothingToLoad).add.map((option) => option.kind)).toEqual([
      "father",
      "sibling",
    ]);
  });

  it("offers loading first where we haven't looked, instead of risking a duplicate", () => {
    const unknown = tree({ parentsKnownIds: new Set(), childrenKnownIds: new Set() });
    const options = addOptions(unknown, "lone", { canLoadParents: true, canLoadChildren: true });
    expect(options.add).toEqual([]);
    expect(options.load).toEqual(["up", "down"]);
  });

  it("offers a child once the children have been looked up, and no parent where we haven't looked", () => {
    // dad's own parents were never looked up, so no father/mother for him.
    expect(addOptions(tree(), "dad", nothingToLoad).add.map((option) => option.kind)).toEqual([
      "child",
    ]);
  });
});
