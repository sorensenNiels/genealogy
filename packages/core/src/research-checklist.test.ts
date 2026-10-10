import { describe, expect, it } from "vitest";

import { researchChecklist, type ResearchChecklistInput } from "./research-checklist.js";

const date = { original: "1801", earliest: "1801-01-01", latest: "1801-12-31" };

const NONE: ResearchChecklistInput = {
  birth: null,
  birthPlace: null,
  death: null,
  deathPlace: null,
  isLiving: false,
  parentCount: 0,
  birthCited: false,
  deathCited: false,
  hasPhoto: false,
};

const ALL: ResearchChecklistInput = {
  birth: date,
  birthPlace: "Brande",
  death: date,
  deathPlace: "Brande",
  isLiving: false,
  parentCount: 2,
  birthCited: true,
  deathCited: true,
  hasPhoto: true,
};

describe("researchChecklist", () => {
  it("is 0% with nothing, and points at the birth date first", () => {
    const result = researchChecklist(NONE);
    expect(result.percent).toBe(0);
    expect(result.checks).toHaveLength(8);
    expect(result.next).toBe("birthDate");
  });

  it("is 100% with everything, with nothing next", () => {
    expect(researchChecklist(ALL)).toMatchObject({ percent: 100, next: null });
  });

  it("skips the death checks for someone living", () => {
    const result = researchChecklist({ ...ALL, isLiving: true, death: null, deathCited: false });
    expect(result.checks.map((check) => check.key)).not.toContain("deathDate");
    expect(result.percent).toBe(100);
  });

  it("needs both parents, and a date that actually parsed", () => {
    const result = researchChecklist({
      ...ALL,
      parentCount: 1,
      birth: { original: "unknown", earliest: null, latest: null },
    });
    expect(result.next).toBe("birthDate");
    expect(result.checks.filter((check) => !check.done).map((check) => check.key)).toEqual([
      "birthDate",
      "parents",
    ]);
    expect(result.percent).toBe(75);
  });
});
