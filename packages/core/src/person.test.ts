import { describe, expect, it } from "vitest";

import {
  calculateAge,
  createPersonSchema,
  formatAge,
  formatFullPersonName,
  formatLifespan,
  formatPersonName,
  isPresumedDeceased,
  presumedDeceasedCutoff,
} from "./person.js";

describe("formatPersonName", () => {
  it("joins the parts that are present", () => {
    expect(formatPersonName({ given: "Anne Marie", surname: "Sørensen" })).toBe(
      "Anne Marie Sørensen",
    );
  });

  it("quotes a nickname between the given and last name", () => {
    expect(formatPersonName({ given: "Niels", nickname: ["Pete"], surname: "Sørensen" })).toBe(
      'Niels "Pete" Sørensen',
    );
  });

  it("joins multiple nicknames in one quoted group", () => {
    expect(
      formatPersonName({ given: "Niels", nickname: ["Pete", "Junior"], surname: "Sørensen" }),
    ).toBe('Niels "Pete, Junior" Sørensen');
  });

  it("ignores blank or empty nicknames", () => {
    expect(formatPersonName({ given: "Niels", nickname: [""], surname: "Sørensen" })).toBe(
      "Niels Sørensen",
    );
    expect(formatPersonName({ given: "Niels", nickname: [], surname: "Sørensen" })).toBe(
      "Niels Sørensen",
    );
  });

  it("falls back rather than returning an empty string", () => {
    expect(formatPersonName({ given: "", surname: "  " })).toBe("Unknown");
    expect(formatPersonName({ given: "", surname: "" }, "surnameFirst")).toBe("Unknown");
  });

  it("puts the surname first, in capitals, with a comma", () => {
    expect(
      formatPersonName({ given: "Niels", nickname: ["Pete"], surname: "Sørensen" }, "surnameFirst"),
    ).toBe('SØRENSEN, Niels "Pete"');
  });

  it("drops the comma when there's only one part", () => {
    expect(formatPersonName({ given: "", surname: "Sørensen" }, "surnameFirst")).toBe("SØRENSEN");
    expect(formatPersonName({ given: "Niels", surname: "" }, "surnameFirst")).toBe("Niels");
  });

  it("capitalises the surname in place", () => {
    expect(formatPersonName({ given: "Anne Marie", surname: "Sørensen" }, "surnameCapitals")).toBe(
      "Anne Marie SØRENSEN",
    );
  });
});

describe("formatFullPersonName", () => {
  it("keeps the title with the given name when the surname comes first", () => {
    expect(
      formatFullPersonName(
        { given: "Niels", surname: "Sørensen", titlePrefix: "Dr.", suffix: "Jr." },
        "surnameFirst",
      ),
    ).toBe("SØRENSEN, Dr. Niels, Jr.");
  });

  it("adds a title/prefix and a suffix around the formatted name", () => {
    expect(
      formatFullPersonName({
        given: "Niels",
        nickname: [],
        surname: "Sørensen",
        titlePrefix: "Dr.",
        suffix: "Jr.",
      }),
    ).toBe("Dr. Niels Sørensen, Jr.");
  });

  it("omits prefix and suffix when absent", () => {
    expect(
      formatFullPersonName({
        given: "Niels",
        nickname: [],
        surname: "Sørensen",
        titlePrefix: null,
        suffix: null,
      }),
    ).toBe("Niels Sørensen");
  });
});

const date = (iso: string) => ({ original: iso, earliest: iso, latest: iso });

describe("formatLifespan", () => {
  it("renders both ends with an en dash", () => {
    expect(formatLifespan({ birth: date("1742-03-01"), death: date("1801-11-20") })).toBe(
      "1742–1801",
    );
  });

  it("leaves an unknown end open", () => {
    expect(formatLifespan({ birth: date("1742-03-01"), death: null })).toBe("1742–?");
  });

  it("returns null when nothing is datable", () => {
    expect(formatLifespan({ birth: null, death: null })).toBeNull();
  });

  it("uses the bounds of an approximate date", () => {
    expect(
      formatLifespan({
        birth: { original: "abt 1742", earliest: "1740-01-01", latest: "1744-12-31" },
        death: null,
      }),
    ).toBe("1740–?");
  });
});

describe("createPersonSchema", () => {
  it("fills in defaults for an otherwise empty person", () => {
    expect(createPersonSchema.parse({})).toEqual({
      given: "",
      surname: "",
      gender: "U",
      titlePrefix: null,
      suffix: null,
      birth: null,
      birthPlace: null,
      death: null,
      deathPlace: null,
      causeOfDeath: null,
      burial: null,
      burialPlace: null,
      notes: null,
      isLiving: true,
      restriction: null,
    });
  });

  it("rejects a gender outside the GEDCOM vocabulary", () => {
    expect(createPersonSchema.safeParse({ gender: "X" }).success).toBe(false);
  });
});

describe("calculateAge", () => {
  it("ages a living person to the given date", () => {
    expect(
      calculateAge(
        { birth: date("1990-06-15"), death: null, isLiving: true },
        new Date("2024-06-14T00:00:00Z"),
      ),
    ).toBe(33);
    expect(
      calculateAge(
        { birth: date("1990-06-15"), death: null, isLiving: true },
        new Date("2024-06-15T00:00:00Z"),
      ),
    ).toBe(34);
  });

  it("computes age at death for a deceased person, ignoring `asOf`", () => {
    expect(
      calculateAge(
        { birth: date("1742-03-01"), death: date("1801-11-20"), isLiving: false },
        new Date("2024-01-01T00:00:00Z"),
      ),
    ).toBe(59);
  });

  it("returns null when marked deceased but no death date is recorded", () => {
    expect(calculateAge({ birth: date("1742-03-01"), death: null, isLiving: false })).toBeNull();
  });

  it("returns null when the birth date never resolved to a bound", () => {
    expect(
      calculateAge({
        birth: { original: "sometime", earliest: null, latest: null },
        death: null,
        isLiving: true,
      }),
    ).toBeNull();
  });
});

describe("formatAge", () => {
  it("labels a living person's age", () => {
    expect(
      formatAge(
        { birth: date("1990-06-15"), death: null, isLiving: true },
        new Date("2024-06-15T00:00:00Z"),
      ),
    ).toBe("Age 34");
  });

  it("labels a deceased person's age at death", () => {
    expect(
      formatAge({ birth: date("1742-03-01"), death: date("1801-11-20"), isLiving: false }),
    ).toBe("Died at age 59");
  });

  it("returns null rather than a label when age can't be resolved", () => {
    expect(formatAge({ birth: null, death: null, isLiving: true })).toBeNull();
  });
});

function born(earliest: string, latest = earliest) {
  return { original: earliest, earliest, latest };
}

describe("isPresumedDeceased", () => {
  const today = new Date("2026-10-09T12:00:00Z");

  it("presumes someone marked living and born more than N years ago deceased", () => {
    expect(isPresumedDeceased({ isLiving: true, birth: born("1900-05-01") }, 110, today)).toBe(
      true,
    );
    expect(isPresumedDeceased({ isLiving: true, birth: born("1950-05-01") }, 110, today)).toBe(
      false,
    );
  });

  it("compares on the latest possible birth day, so a vague date isn't presumed early", () => {
    // "abt. 1916": could be as late as 1918 — not yet 110 years.
    expect(
      isPresumedDeceased({ isLiving: true, birth: born("1914-01-01", "1918-12-31") }, 110, today),
    ).toBe(false);
  });

  it("never applies to the deceased, without a birth date, or when turned off (0)", () => {
    expect(isPresumedDeceased({ isLiving: false, birth: born("1800-01-01") }, 110, today)).toBe(
      false,
    );
    expect(isPresumedDeceased({ isLiving: true, birth: null }, 110, today)).toBe(false);
    expect(isPresumedDeceased({ isLiving: true, birth: born("1800-01-01") }, 0, today)).toBe(false);
  });

  it("has a cut-off date the database query can use", () => {
    expect(presumedDeceasedCutoff(110, today)).toBe("1916-10-09");
  });
});
