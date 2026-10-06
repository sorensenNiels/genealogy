import { describe, expect, it } from "vitest";

import { pageNumberOf, paginate } from "./immich.js";

describe("paginate", () => {
  it("splits into fixed-size chunks", () => {
    expect(paginate([1, 2, 3, 4, 5, 6], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("keeps a shorter last page for a remainder", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns an empty array for an empty input", () => {
    expect(paginate([], 4)).toEqual([]);
  });

  it("puts everything on one page when perPage exceeds the length", () => {
    expect(paginate([1, 2], 10)).toEqual([[1, 2]]);
  });

  it("throws for a non-positive page size", () => {
    expect(() => paginate([1], 0)).toThrow("perPage must be at least 1");
  });
});

describe("pageNumberOf", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("returns the 1-based page containing the asset", () => {
    expect(pageNumberOf(order, 2, "a")).toBe(1);
    expect(pageNumberOf(order, 2, "c")).toBe(2);
    expect(pageNumberOf(order, 2, "e")).toBe(3);
  });

  it("returns null for an asset not in the order", () => {
    expect(pageNumberOf(order, 2, "z")).toBeNull();
  });
});
