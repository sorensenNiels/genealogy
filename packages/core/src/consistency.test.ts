import { describe, expect, it } from "vitest";

import { consistencyIssues, wholeYears, type ConsistencyPerson } from "./consistency.js";

const RULES = { minParentAge: 12, maxMotherAge: 55, minMarriageAge: 14 };

/** "1850-03-01" as an exact date; "1850" as the whole year; "abt 1850" with no bounds. */
function day(text: string | null) {
  if (text === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { original: text, earliest: text, latest: text };
  if (/^\d{4}$/.test(text)) {
    return { original: text, earliest: `${text}-01-01`, latest: `${text}-12-31` };
  }
  return { original: text, earliest: null, latest: null };
}

function person(
  id: string,
  gender: string,
  dates: { birth?: string; death?: string; burial?: string } = {},
): ConsistencyPerson {
  return {
    id,
    given: id,
    surname: "",
    gender,
    birth: day(dates.birth ?? null),
    death: day(dates.death ?? null),
    burial: day(dates.burial ?? null),
  };
}

const none = { events: [], unions: [], parents: [], children: [] };

describe("wholeYears", () => {
  it("counts a year only once the day has come round", () => {
    expect(wholeYears("1850-06-15", "1862-06-14")).toBe(11);
    expect(wholeYears("1850-06-15", "1862-06-15")).toBe(12);
  });
});

describe("consistencyIssues", () => {
  it("finds nothing in a consistent life", () => {
    expect(
      consistencyIssues(
        {
          ...none,
          person: person("p", "F", { birth: "1850-03-01", death: "1920", burial: "1920" }),
          events: [{ eventType: "christening", date: day("1850-03-10") }],
          unions: [{ startDate: day("1872-05-01"), partner: null }],
          parents: [person("mother", "F", { birth: "1825" })],
          children: [person("child", "M", { birth: "1875" })],
        },
        RULES,
      ),
    ).toEqual([]);
  });

  it("flags death before birth and burial before death", () => {
    const kinds = consistencyIssues(
      {
        ...none,
        person: person("p", "M", { birth: "1850", death: "1849-05-01", burial: "1849-04-01" }),
      },
      RULES,
    ).map((issue) => issue.kind);
    expect(kinds).toEqual(["deathBeforeBirth", "burialBeforeDeath"]);
  });

  it("gives a vague or unparsed date the benefit of the doubt", () => {
    // Born some time in 1850, died 1 Jan 1850: could be the same day.
    expect(
      consistencyIssues(
        { ...none, person: person("p", "M", { birth: "1850", death: "1850-01-01" }) },
        RULES,
      ),
    ).toEqual([]);
    expect(
      consistencyIssues(
        { ...none, person: person("p", "M", { birth: "abt 1850", death: "1700" }) },
        RULES,
      ),
    ).toEqual([]);
  });

  it("flags events before birth and after burial, but not a burial itself", () => {
    const issues = consistencyIssues(
      {
        ...none,
        person: person("p", "M", { birth: "1850", burial: "1900-06-01" }),
        events: [
          { eventType: "residence", date: day("1845") },
          { eventType: "occupation", date: day("1905") },
          { eventType: "cremation", date: day("1900-06-02") },
        ],
      },
      RULES,
    );
    expect(issues).toEqual([
      { kind: "eventBeforeBirth", eventType: "residence" },
      { kind: "eventAfterBurial", eventType: "occupation" },
    ]);
  });

  it("flags a marriage too young, before birth, or after burial", () => {
    const partner = { id: "q", given: "Q", surname: "" };
    expect(
      consistencyIssues(
        {
          ...none,
          person: person("p", "F", { birth: "1850-06-01", burial: "1900" }),
          unions: [
            { startDate: day("1860-01-01"), partner },
            { startDate: day("1849"), partner: null },
            { startDate: day("1905"), partner: null },
          ],
        },
        RULES,
      ),
    ).toEqual([
      { kind: "marriedTooYoung", age: 9, relative: partner },
      { kind: "eventBeforeBirth", eventType: "marriage" },
      { kind: "eventAfterBurial", eventType: "marriage" },
    ]);
  });

  it("checks the person against their parents", () => {
    const issues = consistencyIssues(
      {
        ...none,
        person: person("child", "M", { birth: "1880-06-01" }),
        parents: [
          person("young father", "M", { birth: "1872-01-01", death: "1878" }),
          person("old mother", "F", { birth: "1820", burial: "1879" }),
        ],
      },
      RULES,
    );
    expect(issues.map((issue) => issue.kind)).toEqual([
      "parentTooYoung",
      "bornLongAfterFatherDied",
      "motherTooOld",
      "bornAfterMotherDied",
    ]);
    expect(issues[0]).toMatchObject({ age: 8, relative: { id: "young father" } });
  });

  it("allows a child born within a year of the father's death", () => {
    expect(
      consistencyIssues(
        {
          ...none,
          person: person("child", "F", { birth: "1880-08-01" }),
          parents: [person("father", "M", { birth: "1850", death: "1879-12-01" })],
        },
        RULES,
      ),
    ).toEqual([]);
  });

  it("reads the same facts from the parent's side", () => {
    const issues = consistencyIssues(
      {
        ...none,
        person: person("mother", "F", { birth: "1870-01-01", death: "1890-01-01" }),
        children: [
          person("early", "M", { birth: "1880-06-01" }),
          person("late", "F", { birth: "1891" }),
        ],
      },
      RULES,
    );
    expect(issues).toEqual([
      {
        kind: "childWhileTooYoung",
        age: 10,
        relative: { id: "early", given: "early", surname: "" },
      },
      { kind: "childAfterDeath", relative: { id: "late", given: "late", surname: "" } },
    ]);
  });

  it("turns a check off at 0", () => {
    expect(
      consistencyIssues(
        {
          ...none,
          person: person("child", "M", { birth: "1880" }),
          parents: [person("mother", "F", { birth: "1872" })],
        },
        { ...RULES, minParentAge: 0 },
      ),
    ).toEqual([]);
  });
});
