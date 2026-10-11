import { describe, expect, it } from "vitest";

import { isOnThisDay, pickOfTheDay, yearsSince } from "./overview.js";

const exact = (iso: string) => ({ original: iso, earliest: iso, latest: iso });

describe("isOnThisDay", () => {
  it("matches an exact date on the same month and day, any year", () => {
    expect(isOnThisDay(exact("1874-10-10"), 10, 10)).toBe(true);
    expect(isOnThisDay(exact("1874-10-11"), 10, 10)).toBe(false);
  });

  it("ignores a date that isn't one exact day", () => {
    expect(
      isOnThisDay({ original: "Oct 1874", earliest: "1874-10-01", latest: "1874-10-31" }, 10, 1),
    ).toBe(false);
    expect(isOnThisDay({ original: "abt 1874", earliest: null, latest: null }, 1, 1)).toBe(false);
    expect(isOnThisDay(null, 1, 1)).toBe(false);
  });
});

describe("yearsSince", () => {
  it("counts the years to today", () => {
    expect(yearsSince(exact("1874-10-10"), "2026-10-10")).toBe(152);
  });
});

describe("pickOfTheDay", () => {
  const ids = ["c", "a", "b", "d", "e"];

  it("picks the same person all day, whatever order the ids come in", () => {
    expect(pickOfTheDay(ids, "2026-10-10")).toBe(pickOfTheDay(ids.toReversed(), "2026-10-10"));
  });

  it("moves on over the days", () => {
    const picks = new Set(
      ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"].map((day) =>
        pickOfTheDay(ids, day),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("is null with nobody to pick", () => {
    expect(pickOfTheDay([], "2026-10-10")).toBeNull();
  });
});
