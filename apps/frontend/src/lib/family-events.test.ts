import { describe, expect, it } from "vitest";

import { familyEvents, type FamilyEventRelative } from "./family-events";

const on = (iso: string) => ({ original: iso, earliest: iso, latest: iso });

function relative(id: string, extra: Partial<FamilyEventRelative> = {}): FamilyEventRelative {
  return {
    id,
    given: id,
    surname: "",
    gender: "U",
    birth: null,
    birthPlace: null,
    death: null,
    deathPlace: null,
    ...extra,
  };
}

const anders = { birth: on("1850-03-03"), death: on("1921-06-01"), isLiving: false };

describe("familyEvents", () => {
  it("includes children's births and deaths and a spouse's and parents' deaths within the life", () => {
    const events = familyEvents(anders, {
      parents: [relative("dad", { death: on("1880-01-01"), deathPlace: "Ribe" })],
      spouses: [relative("karen", { death: on("1910-05-05") })],
      children: [relative("kid", { birth: on("1875-02-02"), death: on("1900-01-01") })],
    });
    expect(events.map((event) => [event.kind, event.relative.id])).toEqual([
      ["childBirth", "kid"],
      ["childDeath", "kid"],
      ["spouseDeath", "karen"],
      ["parentDeath", "dad"],
    ]);
    expect(events.at(-1)?.place).toBe("Ribe");
  });

  it("leaves out what happened before the birth or after the death", () => {
    const events = familyEvents(anders, {
      parents: [relative("grandpa", { death: on("1840-01-01") })],
      spouses: [relative("karen", { death: on("1930-01-01") })],
      children: [relative("kid", { birth: on("1880-01-01"), death: on("1950-01-01") })],
    });
    expect(events.map((event) => event.kind)).toEqual(["childBirth"]);
  });

  it("has no end for someone living, and skips relatives with no dates (e.g. redacted)", () => {
    const living = { birth: on("1980-01-01"), death: null, isLiving: true };
    const events = familyEvents(living, {
      parents: [relative("dad", { death: on("2020-01-01") })],
      spouses: [relative("hidden")],
      children: [],
    });
    expect(events.map((event) => event.relative.id)).toEqual(["dad"]);
  });

  it("keeps an event whose vague date overlaps the life", () => {
    const events = familyEvents(anders, {
      parents: [
        relative("dad", {
          death: { original: "abt 1850", earliest: "1848-01-01", latest: "1852-12-31" },
        }),
      ],
      spouses: [],
      children: [],
    });
    expect(events).toHaveLength(1);
  });
});
