import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { familyLine } from "./-family-line";

// Just enough of i18next's `t` to see which key and names were used.
const t = ((key: string, values?: { parents?: string }) =>
  `${key}(${values?.parents ?? ""})`) as unknown as TFunction;

const on = (iso: string) => ({ original: iso, earliest: iso, latest: iso });

function person(family: { parents: unknown[]; spouses: unknown[] } | null, gender = "M") {
  return { gender, family } as unknown as Parameters<typeof familyLine>[0];
}

const both = { detailParents: true, detailSpouses: true };

describe("familyLine", () => {
  const jens = { id: "1", given: "Jens", surname: "Pedersen", gender: "M" };
  const ane = { id: "2", given: "Ane", surname: "Nielsdatter", gender: "F" };
  const maren = { id: "3", given: "Maren", surname: "Hansdatter", gender: "F" };

  it("names the parents, then each spouse with the marriage year", () => {
    expect(
      familyLine(
        person({ parents: [jens, ane], spouses: [{ ...maren, married: on("1874-05-12") }] }),
        both,
        t,
      ),
    ).toBe("people.childOf.M(Jens Pedersen & Ane Nielsdatter) · ⚭ 1874 Maren Hansdatter");
  });

  it("leaves out the year when the marriage isn't dated", () => {
    expect(
      familyLine(person({ parents: [], spouses: [{ ...maren, married: null }] }), both, t),
    ).toBe("⚭ Maren Hansdatter");
  });

  it("follows the settings, and says nothing without family", () => {
    const row = person({ parents: [jens], spouses: [{ ...maren, married: null }] }, "F");
    expect(familyLine(row, { detailParents: false, detailSpouses: true }, t)).toBe(
      "⚭ Maren Hansdatter",
    );
    expect(familyLine(row, { detailParents: true, detailSpouses: false }, t)).toBe(
      "people.childOf.F(Jens Pedersen)",
    );
    expect(familyLine(person({ parents: [], spouses: [] }), both, t)).toBeNull();
    expect(familyLine(person(null), both, t)).toBeNull();
  });
});
