import { describe, expect, it } from "vitest";

import { formatKinship, kinshipsFrom, type KinshipGraph } from "./kinship.js";

/**
 * A three-generation family around "me":
 *
 *   gf ─ gm (father's parents)         mgf (mother's father)
 *      │                                 │
 *   ┌──┴───────┐                         │
 *  dad ─ mom   uncle ─ uncleWife        mom
 *     │               │
 *  ┌──┴──┐         cousin ─ (child: cousinKid)
 *  me ─ wife  sis
 *  │             │
 *  son ─ sonWife niece
 *
 * plus a half-brother (dad + dadsEx), and wife's father and brother.
 */
const people = [
  ["gf", "M"],
  ["gm", "F"],
  ["mgf", "M"],
  ["dad", "M"],
  ["mom", "F"],
  ["dadsEx", "F"],
  ["halfBro", "M"],
  ["uncle", "M"],
  ["uncleWife", "F"],
  ["cousin", "F"],
  ["cousinKid", "M"],
  ["me", "M"],
  ["wife", "F"],
  ["wifesDad", "M"],
  ["wifesBro", "M"],
  ["sis", "F"],
  ["niece", "F"],
  ["son", "M"],
  ["sonWife", "F"],
  ["stranger", "U"],
] as const;

const parentOf: [string, string][] = [
  ["gf", "dad"],
  ["gm", "dad"],
  ["gf", "uncle"],
  ["gm", "uncle"],
  ["mgf", "mom"],
  ["dad", "me"],
  ["mom", "me"],
  ["dad", "sis"],
  ["mom", "sis"],
  ["dad", "halfBro"],
  ["dadsEx", "halfBro"],
  ["uncle", "cousin"],
  ["cousin", "cousinKid"],
  ["sis", "niece"],
  ["me", "son"],
  ["wifesDad", "wife"],
  ["wifesDad", "wifesBro"],
];

const graph: KinshipGraph = {
  people: people.map(([id, gender]) => ({ id, gender })),
  parentEdges: parentOf.map(([parentId, childId]) => ({ parentId, childId })),
  spouseEdges: [
    ["dad", "mom"],
    ["dad", "dadsEx"],
    ["uncle", "uncleWife"],
    ["me", "wife"],
    ["son", "sonWife"],
  ],
};

const genderOf = new Map<string, string>(people);
const kinships = kinshipsFrom("me", graph);
const label = (id: string, language: "en" | "da" = "en") => {
  const kinship = kinships.get(id);
  return kinship ? formatKinship(kinship, genderOf.get(id)!, language) : undefined;
};

describe("kinshipsFrom + formatKinship", () => {
  it("names blood relatives in English", () => {
    expect(label("me")).toBeNull();
    expect(label("dad")).toBe("Father");
    expect(label("gm")).toBe("Grandmother");
    expect(label("sis")).toBe("Sister");
    expect(label("halfBro")).toBe("Half-brother");
    expect(label("uncle")).toBe("Uncle");
    expect(label("cousin")).toBe("Cousin");
    expect(label("cousinKid")).toBe("Cousin once removed");
    expect(label("niece")).toBe("Niece");
    expect(label("son")).toBe("Son");
  });

  it("names relatives by marriage", () => {
    expect(label("wife")).toBe("Wife");
    expect(label("wifesDad")).toBe("Father-in-law");
    expect(label("wifesBro")).toBe("Brother-in-law");
    expect(label("sonWife")).toBe("Daughter-in-law");
    expect(label("dadsEx")).toBe("Stepmother");
    expect(label("uncleWife")).toBe("Aunt");
    expect(label("stranger")).toBeUndefined();
  });

  it("uses the Danish words, with the side of the family where Danish has one", () => {
    expect(label("gf", "da")).toBe("Farfar");
    expect(label("mgf", "da")).toBe("Morfar");
    expect(label("uncle", "da")).toBe("Farbror");
    expect(label("uncleWife", "da")).toBe("Tante");
    expect(label("cousin", "da")).toBe("Kusine");
    expect(label("cousinKid", "da")).toBe("Fætter, 1 gen. forskudt");
    expect(label("halfBro", "da")).toBe("Halvbror");
    expect(label("wifesBro", "da")).toBe("Svoger");
    expect(label("sonWife", "da")).toBe("Svigerdatter");
  });

  it("counts greats and tips for distant generations", () => {
    const line = ["M", "M", "M", "M"] as const;
    expect(formatKinship({ kind: "ancestor", generations: 3, line: [...line] }, "F", "en")).toBe(
      "Great-grandmother",
    );
    expect(formatKinship({ kind: "ancestor", generations: 5, line: [...line] }, "M", "en")).toBe(
      "3rd great-grandfather",
    );
    expect(formatKinship({ kind: "ancestor", generations: 4, line: [...line] }, "M", "da")).toBe(
      "Tipoldefar",
    );
    expect(formatKinship({ kind: "cousin", degree: 2, removed: 2 }, "U", "en")).toBe(
      "2nd cousin twice removed",
    );
    expect(formatKinship({ kind: "cousin", degree: 2, removed: 0 }, "M", "da")).toBe(
      "Næstsøskendebarn",
    );
  });

  it("survives someone recorded as their own ancestor", () => {
    const cyclic: KinshipGraph = {
      people: [
        { id: "a", gender: "M" },
        { id: "b", gender: "M" },
      ],
      parentEdges: [
        { parentId: "a", childId: "b" },
        { parentId: "b", childId: "a" },
      ],
      spouseEdges: [],
    };
    expect(kinshipsFrom("a", cyclic).get("b")).toBeDefined();
  });
});
