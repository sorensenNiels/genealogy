import { describe, expect, it } from "vitest";

import { createCitationSchema } from "./citation.js";

const sourceId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const personId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const factId = "c56a4180-65aa-42ec-a945-5fd21dec0538";

describe("createCitationSchema", () => {
  it('rejects a factId on a "person" citation', () => {
    const result = createCitationSchema.safeParse({
      sourceId,
      personId,
      factType: "person",
      factId,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a "person" citation with no factId', () => {
    const result = createCitationSchema.safeParse({ sourceId, personId, factType: "person" });
    expect(result.success).toBe(true);
  });

  it.each(["name", "event", "union"] as const)(
    'requires a factId on a "%s" citation',
    (factType) => {
      const result = createCitationSchema.safeParse({ sourceId, personId, factType });
      expect(result.success).toBe(false);
    },
  );

  it.each(["name", "event", "union"] as const)(
    'accepts a "%s" citation once it has a factId',
    (factType) => {
      const result = createCitationSchema.safeParse({ sourceId, personId, factType, factId });
      expect(result.success).toBe(true);
    },
  );

  it("defaults to a person-level citation", () => {
    const result = createCitationSchema.parse({ sourceId, personId });
    expect(result.factType).toBe("person");
    expect(result.factId).toBeNull();
  });
});
