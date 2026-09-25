import { describe, expect, it } from "vitest";

import {
  formatHistoricalDate,
  joinHistoricalDateText,
  parseHistoricalDate,
  parseHistoricalDateDetailed,
  resolveHistoricalDate,
  splitHistoricalDateText,
} from "./historical-date.js";

describe("parseHistoricalDate", () => {
  it("resolves an exact day/month/year to that single day", () => {
    expect(parseHistoricalDate("12 MAR 1901")).toEqual({
      earliest: "1901-03-12",
      latest: "1901-03-12",
    });
  });

  it("accepts a full month name", () => {
    expect(parseHistoricalDate("12 March 1901")).toEqual({
      earliest: "1901-03-12",
      latest: "1901-03-12",
    });
  });

  it("bounds a month/year to the first and last day of that month", () => {
    expect(parseHistoricalDate("MAR 1901")).toEqual({
      earliest: "1901-03-01",
      latest: "1901-03-31",
    });
  });

  it("resolves an ISO year-month-day to that single day", () => {
    expect(parseHistoricalDate("1970-11-18")).toEqual({
      earliest: "1970-11-18",
      latest: "1970-11-18",
    });
  });

  it("bounds an ISO year-month to the first and last day of that month", () => {
    expect(parseHistoricalDate("1970-11")).toEqual({
      earliest: "1970-11-01",
      latest: "1970-11-30",
    });
  });

  it("rejects an ISO date with an out-of-range month or day", () => {
    expect(parseHistoricalDate("1970-13-01")).toEqual({ earliest: null, latest: null });
    expect(parseHistoricalDate("1970-02-30")).toEqual({ earliest: null, latest: null });
  });

  it("bounds a bare year to Jan 1 and Dec 31", () => {
    expect(parseHistoricalDate("1901")).toEqual({
      earliest: "1901-01-01",
      latest: "1901-12-31",
    });
  });

  it("resolves an approximate date the same as the exact one", () => {
    expect(parseHistoricalDate("abt 1854")).toEqual({
      earliest: "1854-01-01",
      latest: "1854-12-31",
    });
    expect(parseHistoricalDate("circa 12 MAR 1901")).toEqual({
      earliest: "1901-03-12",
      latest: "1901-03-12",
    });
    // "c." is the standard genealogical shorthand for "circa" — as common as
    // (if not more common than) the spelled-out word.
    expect(parseHistoricalDate("c. Nov 1986")).toEqual({
      earliest: "1986-11-01",
      latest: "1986-11-30",
    });
    expect(parseHistoricalDate("c 1854")).toEqual({
      earliest: "1854-01-01",
      latest: "1854-12-31",
    });
  });

  it("leaves only a latest bound for 'before'", () => {
    expect(parseHistoricalDate("bef 1920")).toEqual({
      earliest: null,
      latest: "1920-12-31",
    });
  });

  it("leaves only an earliest bound for 'after'", () => {
    expect(parseHistoricalDate("aft 1920")).toEqual({
      earliest: "1920-01-01",
      latest: null,
    });
  });

  it("respects the days in a given month", () => {
    expect(parseHistoricalDate("29 FEB 1900")).toEqual({ earliest: null, latest: null });
    expect(parseHistoricalDate("29 FEB 1904")).toEqual({
      earliest: "1904-02-29",
      latest: "1904-02-29",
    });
  });

  it("returns null bounds for text it can't read at all", () => {
    expect(parseHistoricalDate("sometime in the war")).toEqual({ earliest: null, latest: null });
  });

  it("returns null bounds for blank text", () => {
    expect(parseHistoricalDate("")).toEqual({ earliest: null, latest: null });
    expect(parseHistoricalDate("   ")).toEqual({ earliest: null, latest: null });
  });

  it("resolves a BET/AND range from the start of the first date to the end of the second", () => {
    expect(parseHistoricalDate("BET 1850 AND 1860")).toEqual({
      earliest: "1850-01-01",
      latest: "1860-12-31",
    });
  });

  it("resolves a BET/AND range with mixed precision on each side", () => {
    expect(parseHistoricalDate("BETWEEN 12 MAR 1850 AND MAR 1860")).toEqual({
      earliest: "1850-03-12",
      latest: "1860-03-31",
    });
  });

  it("resolves a FROM/TO range the same way as BET/AND", () => {
    expect(parseHistoricalDate("FROM 1900 TO 1905")).toEqual({
      earliest: "1900-01-01",
      latest: "1905-12-31",
    });
    expect(parseHistoricalDate("FROM 1 JAN 1900 TO 31 DEC 1905")).toEqual({
      earliest: "1900-01-01",
      latest: "1905-12-31",
    });
  });

  it("rejects a malformed range rather than half-trusting it", () => {
    expect(parseHistoricalDate("BET 1850")).toEqual({ earliest: null, latest: null });
    expect(parseHistoricalDate("BETWEEN 1850 AND")).toEqual({ earliest: null, latest: null });
    expect(parseHistoricalDate("FROM 1900")).toEqual({ earliest: null, latest: null });
    expect(parseHistoricalDate("BET 1850 AND sometime later")).toEqual({
      earliest: null,
      latest: null,
    });
  });

  it("rejects ambiguous numeric-only dates rather than guessing DD/MM vs MM/DD", () => {
    expect(parseHistoricalDate("03/04/1901")).toEqual({ earliest: null, latest: null });
    expect(parseHistoricalDate("3/4/01")).toEqual({ earliest: null, latest: null });
  });
});

describe("parseHistoricalDateDetailed", () => {
  it("tags exact, about, before and after with their precision", () => {
    expect(parseHistoricalDateDetailed("12 MAR 1901")).toEqual({
      kind: "exact",
      date: {
        precision: "day",
        year: 1901,
        month: 3,
        day: 12,
        earliest: "1901-03-12",
        latest: "1901-03-12",
      },
    });
    expect(parseHistoricalDateDetailed("MAR 1901")).toEqual({
      kind: "exact",
      date: {
        precision: "month",
        year: 1901,
        month: 3,
        day: null,
        earliest: "1901-03-01",
        latest: "1901-03-31",
      },
    });
    expect(parseHistoricalDateDetailed("1901")).toEqual({
      kind: "exact",
      date: {
        precision: "year",
        year: 1901,
        month: null,
        day: null,
        earliest: "1901-01-01",
        latest: "1901-12-31",
      },
    });
    expect(parseHistoricalDateDetailed("abt 1854").kind).toBe("about");
    expect(parseHistoricalDateDetailed("bef 1920").kind).toBe("before");
    expect(parseHistoricalDateDetailed("aft 1920").kind).toBe("after");
  });

  it("tags a range as between or from-to with both sides parsed", () => {
    const between = parseHistoricalDateDetailed("BET 1850 AND 1860");
    if (between.kind !== "between") throw new Error("expected kind: between");
    expect(between.start.year).toBe(1850);
    expect(between.end.year).toBe(1860);

    const fromTo = parseHistoricalDateDetailed("FROM 1900 TO 1905");
    expect(fromTo.kind).toBe("from-to");
  });

  it("returns unparsed for text it can't read at all", () => {
    expect(parseHistoricalDateDetailed("sometime in the war")).toEqual({ kind: "unparsed" });
    expect(parseHistoricalDateDetailed("")).toEqual({ kind: "unparsed" });
  });
});

describe("formatHistoricalDate", () => {
  it("formats exact dates at each precision", () => {
    expect(formatHistoricalDate(parseHistoricalDateDetailed("12 MAR 1901"))).toBe("12 March 1901");
    expect(formatHistoricalDate(parseHistoricalDateDetailed("MAR 1901"))).toBe("March 1901");
    expect(formatHistoricalDate(parseHistoricalDateDetailed("1901"))).toBe("1901");
  });

  it("formats approximate, before and after with their qualifier word", () => {
    expect(formatHistoricalDate(parseHistoricalDateDetailed("abt 1854"))).toBe("About 1854");
    expect(formatHistoricalDate(parseHistoricalDateDetailed("bef 1920"))).toBe("Before 1920");
    expect(formatHistoricalDate(parseHistoricalDateDetailed("aft 1920"))).toBe("After 1920");
  });

  it("formats ranges with each side at its own precision", () => {
    expect(formatHistoricalDate(parseHistoricalDateDetailed("BET 1850 AND 1860"))).toBe(
      "Between 1850 and 1860",
    );
    expect(formatHistoricalDate(parseHistoricalDateDetailed("BETWEEN 1850 AND 12 MAY 1860"))).toBe(
      "Between 1850 and 12 May 1860",
    );
    expect(formatHistoricalDate(parseHistoricalDateDetailed("FROM 1900 TO 1905"))).toBe(
      "From 1900 to 1905",
    );
  });

  it("returns null for unparsed text", () => {
    expect(formatHistoricalDate(parseHistoricalDateDetailed("sometime in the war"))).toBeNull();
  });
});

describe("resolveHistoricalDate", () => {
  it("resolves the ISO date that originally exposed the missing-age bug", () => {
    expect(resolveHistoricalDate("1970-11-18")).toEqual({
      earliest: "1970-11-18",
      latest: "1970-11-18",
      display: "18 November 1970",
    });
  });

  it("returns all null for blank or unreadable text", () => {
    expect(resolveHistoricalDate("")).toEqual({ earliest: null, latest: null, display: null });
    expect(resolveHistoricalDate("sometime in the war")).toEqual({
      earliest: null,
      latest: null,
      display: null,
    });
  });

  it("is robust to extra whitespace and case in range keywords", () => {
    expect(resolveHistoricalDate("  bet  1850   and   1860  ")).toEqual({
      earliest: "1850-01-01",
      latest: "1860-12-31",
      display: "Between 1850 and 1860",
    });
  });
});

describe("splitHistoricalDateText", () => {
  it("splits a bare date as exact", () => {
    expect(splitHistoricalDateText("12 MAR 1901")).toEqual({
      quality: "exact",
      value: "12 MAR 1901",
      endValue: "",
    });
  });

  it("splits an approximate qualifier off the value", () => {
    expect(splitHistoricalDateText("abt 1854")).toEqual({
      quality: "about",
      value: "1854",
      endValue: "",
    });
    expect(splitHistoricalDateText("circa 1854")).toEqual({
      quality: "about",
      value: "1854",
      endValue: "",
    });
    expect(splitHistoricalDateText("c. 1854")).toEqual({
      quality: "about",
      value: "1854",
      endValue: "",
    });
  });

  it("splits before/after off the value", () => {
    expect(splitHistoricalDateText("bef 1920")).toEqual({
      quality: "before",
      value: "1920",
      endValue: "",
    });
    expect(splitHistoricalDateText("aft 1920")).toEqual({
      quality: "after",
      value: "1920",
      endValue: "",
    });
  });

  it("splits a between range into its two sides", () => {
    expect(splitHistoricalDateText("BET 1850 AND 1860")).toEqual({
      quality: "between",
      value: "1850",
      endValue: "1860",
    });
  });

  it("doesn't require the remainder to already be a valid date", () => {
    // Mid-typing: the qualifier is enough to pick the quality even before
    // the date part itself resolves to anything.
    expect(splitHistoricalDateText("abt 18")).toEqual({
      quality: "about",
      value: "18",
      endValue: "",
    });
  });

  it("falls back to exact for from-to and unreadable text, keeping the wording intact", () => {
    expect(splitHistoricalDateText("FROM 1900 TO 1905")).toEqual({
      quality: "exact",
      value: "FROM 1900 TO 1905",
      endValue: "",
    });
    expect(splitHistoricalDateText("sometime in the war")).toEqual({
      quality: "exact",
      value: "sometime in the war",
      endValue: "",
    });
  });

  it("returns an empty exact split for blank text", () => {
    expect(splitHistoricalDateText("")).toEqual({ quality: "exact", value: "", endValue: "" });
    expect(splitHistoricalDateText("   ")).toEqual({ quality: "exact", value: "", endValue: "" });
  });
});

describe("joinHistoricalDateText", () => {
  it("joins each quality with its qualifier word", () => {
    expect(joinHistoricalDateText({ quality: "exact", value: "1901", endValue: "" })).toBe("1901");
    expect(joinHistoricalDateText({ quality: "about", value: "1854", endValue: "" })).toBe(
      "About 1854",
    );
    expect(joinHistoricalDateText({ quality: "before", value: "1920", endValue: "" })).toBe(
      "Before 1920",
    );
    expect(joinHistoricalDateText({ quality: "after", value: "1920", endValue: "" })).toBe(
      "After 1920",
    );
    expect(joinHistoricalDateText({ quality: "between", value: "1850", endValue: "1860" })).toBe(
      "Between 1850 and 1860",
    );
  });

  it("returns null when the value is blank", () => {
    expect(joinHistoricalDateText({ quality: "exact", value: "", endValue: "" })).toBeNull();
    expect(joinHistoricalDateText({ quality: "about", value: "  ", endValue: "" })).toBeNull();
  });

  it("returns null for a between with either side blank", () => {
    expect(joinHistoricalDateText({ quality: "between", value: "1850", endValue: "" })).toBeNull();
    expect(joinHistoricalDateText({ quality: "between", value: "", endValue: "1860" })).toBeNull();
  });

  it("round-trips through the parser for every quality", () => {
    for (const parts of [
      { quality: "exact", value: "12 MAR 1901", endValue: "" },
      { quality: "about", value: "1854", endValue: "" },
      { quality: "before", value: "1920", endValue: "" },
      { quality: "after", value: "1920", endValue: "" },
      { quality: "between", value: "1850", endValue: "1860" },
    ] as const) {
      const joined = joinHistoricalDateText(parts);
      expect(joined).not.toBeNull();
      expect(splitHistoricalDateText(joined ?? "")).toEqual(parts);
      expect(parseHistoricalDateDetailed(joined ?? "").kind).toBe(parts.quality);
    }
  });
});
