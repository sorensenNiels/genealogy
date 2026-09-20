import { describe, expect, it } from "vitest";

import { createPersonSchema, formatLifespan, formatPersonName } from "./person.js";

describe("formatPersonName", () => {
  it("joins the parts that are present", () => {
    expect(formatPersonName({ given: "Anne Marie", patronymic: null, surname: "Sørensen" })).toBe(
      "Anne Marie Sørensen",
    );
  });

  it("keeps a patronymic between the given name and the surname", () => {
    expect(formatPersonName({ given: "Niels", patronymic: "Pedersen", surname: "Sørensen" })).toBe(
      "Niels Pedersen Sørensen",
    );
  });

  it("falls back rather than returning an empty string", () => {
    expect(formatPersonName({ given: "", patronymic: null, surname: "  " })).toBe("Unknown");
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
      patronymic: null,
      sex: "U",
      birth: null,
      birthPlace: null,
      death: null,
      deathPlace: null,
      notes: null,
    });
  });

  it("rejects a sex outside the GEDCOM vocabulary", () => {
    expect(createPersonSchema.safeParse({ sex: "X" }).success).toBe(false);
  });
});
