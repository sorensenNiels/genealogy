import { describe, expect, it } from "vitest";

import {
  ageMismatch,
  allCensuses,
  BUILT_IN_CENSUS_COUNTRIES,
  BUILT_IN_CENSUSES,
  censusDayDate,
  censusesInLifetime,
  estimatedBirthFromAge,
  findCensus,
  parseRecordAge,
} from "./census.js";

const on = (iso: string) => ({ original: iso, earliest: iso, latest: iso });

describe("built-in censuses", () => {
  it("cover every built-in country with unique keys", () => {
    const keys = BUILT_IN_CENSUSES.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const country of BUILT_IN_CENSUS_COUNTRIES) {
      expect(BUILT_IN_CENSUSES.some((definition) => definition.country === country)).toBe(true);
    }
  });

  it("know which columns each census asked", () => {
    expect(findCensus("dk-1840")).toMatchObject({ hasBirthplace: false, hasRelationship: true });
    expect(findCensus("dk-1845")?.hasBirthplace).toBe(true);
    expect(findCensus("us-1870")).toMatchObject({ hasBirthplace: true, hasRelationship: false });
    expect(findCensus("gb-eng-1841")).toMatchObject({ date: "1841-06-06", hasBirthplace: false });
  });
});

describe("findCensus and allCensuses", () => {
  const custom = [
    {
      key: "de-1900",
      country: "de",
      year: 1900,
      date: "1900-12-01",
      hasBirthplace: true,
      hasRelationship: true,
      label: "German census 1900",
    },
  ];

  it("includes custom censuses from Settings", () => {
    expect(findCensus("de-1900", custom)?.label).toBe("German census 1900");
    expect(allCensuses(custom).some((definition) => definition.key === "de-1900")).toBe(true);
  });

  it("opens a record whose census is no longer known, with every column", () => {
    expect(findCensus("xx-1899")).toMatchObject({ country: "xx", year: 1899, hasBirthplace: true });
    expect(findCensus(null)).toBeNull();
  });

  it("words the census day in the user's language", () => {
    expect(censusDayDate(findCensus("dk-1845")!, "da")).toMatchObject({ earliest: "1845-02-01" });
  });
});

describe("parseRecordAge", () => {
  it("reads whole years, and infants' months and fractions as 0", () => {
    expect(parseRecordAge("34")).toBe(34);
    expect(parseRecordAge("34 år")).toBe(34);
    expect(parseRecordAge("3 mdr")).toBe(0);
    expect(parseRecordAge("6 mos")).toBe(0);
    expect(parseRecordAge("½")).toBe(0);
    expect(parseRecordAge("")).toBeNull();
    expect(parseRecordAge("ukendt")).toBeNull();
  });
});

describe("estimatedBirthFromAge", () => {
  it("is about the year most of the possible birth months fall in", () => {
    // Aged 34 on 1 Feb 1840: born 2 Feb 1805 – 1 Feb 1806, mostly 1805.
    expect(estimatedBirthFromAge("34", "1840-02-01", "en")).toMatchObject({
      original: "About 1805",
      earliest: "1805-01-01",
    });
    // Aged 10 on 5 Nov 1930: mostly 1920.
    expect(estimatedBirthFromAge("10", "1930-11-05", "da")?.earliest).toBe("1920-01-01");
  });

  it("has nothing to say without a readable age", () => {
    expect(estimatedBirthFromAge("", "1840-02-01", "en")).toBeNull();
  });
});

describe("ageMismatch", () => {
  it("allows a couple of years of rounding, then says how far off", () => {
    expect(ageMismatch(on("1806-05-01"), "33", "1840-02-01")).toBeNull();
    expect(ageMismatch(on("1806-05-01"), "35", "1840-02-01")).toBeNull();
    expect(ageMismatch(on("1806-05-01"), "40", "1840-02-01")).toBe(7);
    expect(ageMismatch(on("1806-05-01"), "25", "1840-02-01")).toBe(-8);
  });

  it("takes a vague birth date's whole range into account", () => {
    const about = { original: "abt 1806", earliest: "1806-01-01", latest: "1806-12-31" };
    expect(ageMismatch(about, "36", "1840-02-01")).toBeNull();
    expect(ageMismatch(null, "36", "1840-02-01")).toBeNull();
  });
});

describe("censusesInLifetime", () => {
  const danish = BUILT_IN_CENSUSES.filter((definition) => definition.country === "dk");

  it("lists the censuses between birth and death, in date order", () => {
    const years = censusesInLifetime(
      { birth: on("1838-06-01"), death: on("1872-03-01"), isLiving: false },
      danish,
    ).map((definition) => definition.year);
    expect(years).toEqual([1840, 1845, 1850, 1855, 1860, 1870]);
  });

  it("assumes up to 100 years without a death date, and needs a birth date", () => {
    const years = censusesInLifetime(
      { birth: on("1900-01-01"), death: null, isLiving: false },
      danish,
    );
    expect(years.at(-1)?.year).toBe(1940);
    expect(
      censusesInLifetime({ birth: null, death: on("1900-01-01"), isLiving: false }, danish),
    ).toEqual([]);
  });
});
