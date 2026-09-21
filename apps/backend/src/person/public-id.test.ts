import { describe, expect, it } from "vitest";

import { generatePublicId } from "./public-id.js";

describe("generatePublicId", () => {
  it("matches the XXXX-XXX shape, starting with a letter", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePublicId()).toMatch(/^[A-Z][A-Z0-9]{3}-[A-Z0-9]{3}$/);
    }
  });

  it("doesn't repeat across a large sample", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generatePublicId()));
    expect(ids.size).toBe(1000);
  });
});
