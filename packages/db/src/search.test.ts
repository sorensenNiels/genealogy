import { describe, expect, it } from "vitest";

import { searchQuery } from "./search.js";

describe("searchQuery", () => {
  it("makes every word a required prefix", () => {
    expect(searchQuery("  Søren  Brande ")).toBe("søren:* & brande:*");
  });

  it("drops tsquery syntax and punctuation", () => {
    expect(searchQuery("a&b | !c:* (d)")).toBe("a:* & b:* & c:* & d:*");
    expect(searchQuery("1801-03-04")).toBe("1801:* & 03:* & 04:*");
  });

  it("is null with nothing to search for", () => {
    expect(searchQuery(" ,.!? ")).toBeNull();
  });
});
