import { describe, expect, it } from "vitest";

import { lifeAtAGlance, yearsBetween, type LifeSummaryInput } from "./life-summary";

const on = (iso: string) => ({ original: iso, earliest: iso, latest: iso });

function input(overrides: Partial<LifeSummaryInput> = {}): LifeSummaryInput {
  return {
    person: {
      isLiving: false,
      birth: on("1850-03-03"),
      birthPlace: "Ribe",
      death: on("1921-06-01"),
      deathPlace: "Esbjerg",
    },
    unions: [],
    childCount: 0,
    formatDate: (date) => date.original,
    ...overrides,
  };
}

describe("lifeAtAGlance", () => {
  it("tells a full life as birth, marriage, children and death with the age at death", () => {
    const { milestones, sentences } = lifeAtAGlance(
      input({
        unions: [
          {
            startDate: on("1874-10-12"),
            startPlace: "Ribe Domkirke",
            status: "married",
            partnerId: "karen",
            partnerName: "Karen Hansdatter",
          },
        ],
        childCount: 6,
      }),
    );
    expect(milestones.map((m) => [m.kind, m.age])).toEqual([
      ["birth", null],
      ["union", 24],
      ["death", 71],
    ]);
    expect(sentences).toEqual([
      { key: "bornDatePlace", params: { date: "1850-03-03", place: "Ribe" } },
      { key: "marriedDate", params: { spouse: "Karen Hansdatter", date: "1874-10-12" } },
      { key: "children", params: { count: 6 } },
      { key: "diedDatePlaceAge", params: { date: "1921-06-01", place: "Esbjerg", age: 71 } },
    ]);
  });

  it("says only what's known, and a living person's current age instead of a death", () => {
    const { milestones, sentences } = lifeAtAGlance(
      input({
        person: {
          isLiving: true,
          birth: on("1980-05-01"),
          birthPlace: null,
          death: null,
          deathPlace: null,
        },
        today: new Date("2026-10-09T00:00:00Z"),
      }),
    );
    expect(milestones.map((m) => m.kind)).toEqual(["birth"]);
    expect(sentences).toEqual([
      { key: "bornDate", params: { date: "1980-05-01" } },
      { key: "living", params: { age: 46 } },
    ]);
  });

  it("orders unions by date, undated last, and only narrates marriages", () => {
    const { milestones, sentences } = lifeAtAGlance(
      input({
        unions: [
          {
            startDate: null,
            startPlace: null,
            status: "married",
            partnerId: null,
            partnerName: "B",
          },
          {
            startDate: on("1880-01-01"),
            startPlace: null,
            status: "partnership",
            partnerId: "a",
            partnerName: "A",
          },
        ],
      }),
    );
    expect(milestones.filter((m) => m.kind === "union").map((m) => m.partner?.name)).toEqual([
      "A",
      "B",
    ]);
    expect(sentences.filter((s) => s.key.startsWith("married"))).toEqual([
      { key: "married", params: { spouse: "B" } },
    ]);
  });

  it("has nothing to say about someone with no facts", () => {
    expect(
      lifeAtAGlance(
        input({
          person: { isLiving: false, birth: null, birthPlace: null, death: null, deathPlace: null },
        }),
      ),
    ).toEqual({ milestones: [], sentences: [] });
  });
});

describe("yearsBetween", () => {
  it("counts whole years, minding the birthday", () => {
    expect(yearsBetween("1850-03-03", "1921-03-02")).toBe(70);
    expect(yearsBetween("1850-03-03", "1921-03-03")).toBe(71);
    expect(yearsBetween("1850-03-03", null)).toBeNull();
    expect(yearsBetween("1900-01-01", "1890-01-01")).toBeNull();
  });
});
