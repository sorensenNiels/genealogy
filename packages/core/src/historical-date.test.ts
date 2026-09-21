import { describe, expect, it } from "vitest";

import { parseHistoricalDate } from "./historical-date.js";

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
});
