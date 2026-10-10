import { describe, expect, it } from "vitest";

import { nearestCard } from "./tree-navigation";

// A small top-down tree: two grandparents, a parent couple, the root with a
// sibling, and the root's child. Rows are 100 apart, cards 260 apart.
const positions = new Map([
  ["grandpa", { x: 0, y: 0 }],
  ["grandma", { x: 260, y: 0 }],
  ["dad", { x: 130, y: 100 }],
  ["mum", { x: 390, y: 100 }],
  ["sister", { x: 0, y: 200 }],
  ["me", { x: 260, y: 200 }],
  ["kid", { x: 260, y: 300 }],
]);

describe("nearestCard", () => {
  it("moves up a generation before sideways, to the nearest card above", () => {
    expect(nearestCard(positions, "me", "me", "up", false)).toBe("dad");
    expect(nearestCard(positions, "dad", "me", "up", false)).toBe("grandpa");
  });

  it("stays in the same generation when moving sideways", () => {
    expect(nearestCard(positions, "me", "me", "left", false)).toBe("sister");
    expect(nearestCard(positions, "dad", "me", "right", false)).toBe("mum");
  });

  it("returns null at the edge, and starts from the root when the selection isn't drawn", () => {
    expect(nearestCard(positions, "kid", "me", "down", false)).toBeNull();
    expect(nearestCard(positions, "nobody", "me", "down", false)).toBe("kid");
  });

  it("treats left/right as the generation axis in the left-to-right layout", () => {
    // Same people with x and y swapped: generations now run left to right.
    const sideways = new Map([...positions].map(([id, p]) => [id, { x: p.y, y: p.x }]));
    expect(nearestCard(sideways, "me", "me", "left", true)).toBe("dad");
    expect(nearestCard(sideways, "me", "me", "up", true)).toBe("sister");
  });
});
