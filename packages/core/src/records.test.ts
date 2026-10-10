import { describe, expect, it } from "vitest";

import {
  isPrincipal,
  RECORD_TEMPLATES,
  recordTypeSchema,
  relationshipCandidates,
} from "./records.js";

describe("record templates", () => {
  it("has one per record type, and every principal role is a role", () => {
    for (const type of recordTypeSchema.options) {
      const template = RECORD_TEMPLATES[type];
      expect(template.type).toBe(type);
      for (const role of template.principalRoles) expect(template.roles).toContain(role);
      for (const role of Object.keys(template.associationRoles))
        expect(template.roles).toContain(role);
    }
  });

  it("makes every census row a principal, but only the right roles elsewhere", () => {
    expect(isPrincipal("census", "servant")).toBe(true);
    expect(isPrincipal("baptism", "child")).toBe(true);
    expect(isPrincipal("baptism", "godparent")).toBe(false);
    expect(isPrincipal("marriage", "bride")).toBe(true);
  });
});

describe("relationshipCandidates", () => {
  it("links a baptism's parents to the child", () => {
    expect(
      relationshipCandidates("baptism", [
        { role: "child", personId: "kid" },
        { role: "father", personId: "dad" },
        { role: "mother", personId: "mum" },
        { role: "godparent", personId: "aunt" },
      ]),
    ).toEqual([
      { kind: "parent", parentId: "dad", childId: "kid" },
      { kind: "parent", parentId: "mum", childId: "kid" },
    ]);
  });

  it("links each marriage parent to their own child", () => {
    expect(
      relationshipCandidates("marriage", [
        { role: "groom", personId: "g" },
        { role: "bride", personId: "b" },
        { role: "groomFather", personId: "gf" },
        { role: "brideMother", personId: "bm" },
      ]),
    ).toEqual([
      { kind: "parent", parentId: "gf", childId: "g" },
      { kind: "parent", parentId: "bm", childId: "b" },
    ]);
  });

  it("reads a census household: head and wife as spouses and parents of the children", () => {
    expect(
      relationshipCandidates("census", [
        { role: "head", personId: "h" },
        { role: "wife", personId: "w" },
        { role: "son", personId: "s" },
        { role: "servant", personId: "x" },
        { role: "parent", personId: "old" },
        { role: "daughter", personId: null },
      ]),
    ).toEqual([
      { kind: "spouse", aId: "h", bId: "w" },
      { kind: "parent", parentId: "h", childId: "s" },
      { kind: "parent", parentId: "w", childId: "s" },
      { kind: "parent", parentId: "old", childId: "h" },
    ]);
  });

  it("ignores unlinked rows and duplicates", () => {
    expect(
      relationshipCandidates("baptism", [
        { role: "child", personId: "kid" },
        { role: "father", personId: "dad" },
        { role: "father", personId: "dad" },
        { role: "mother", personId: null },
      ]),
    ).toEqual([{ kind: "parent", parentId: "dad", childId: "kid" }]);
  });
});
