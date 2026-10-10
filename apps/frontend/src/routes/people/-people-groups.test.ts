import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { groupPeople } from "./-people-groups";

const t = ((key: string, values?: { year?: number }) =>
  values?.year ? `${key}(${values.year})` : key) as unknown as TFunction;

function person(id: string, surname: string, born: string | null, birthPlace: string | null) {
  const birth = born ? { original: born, earliest: born, latest: born } : null;
  return { id, surname, birth, birthPlace } as unknown as Parameters<typeof groupPeople>[0][number];
}

describe("groupPeople", () => {
  const rows = [
    person("1", "Sørensen", "1801-01-01", "Brande, Ringkøbing"),
    person("2", "sørensen ", "1850-01-01", "Brande"),
    person("3", "Hansen", "1920-01-01", null),
    person("4", "", null, null),
  ];

  it("puts each run of rows under one header, labelled as written", () => {
    const groups = groupPeople(rows, "surname", [{ key: "sørensen", count: 5 }], t);
    expect(groups.map((group) => [group.label, group.people.length, group.count])).toEqual([
      ["Sørensen", 2, 5],
      ["Hansen", 1, 1],
      ["people.groupNone.surname", 1, 1],
    ]);
  });

  it("groups by century and by parish", () => {
    expect(groupPeople(rows, "century", [], t).map((group) => group.label)).toEqual([
      "people.groupCentury(1800)",
      "people.groupCentury(1900)",
      "people.groupNone.century",
    ]);
    expect(groupPeople(rows, "birthplace", [], t).map((group) => group.label)).toEqual([
      "Brande",
      "people.groupNone.birthplace",
    ]);
  });
});
