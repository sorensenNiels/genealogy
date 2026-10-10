import { describe, expect, it } from "vitest";

import {
  compareDates,
  findDuplicatePairs,
  foldName,
  nameMatchKey,
  scoreDuplicate,
  soundKey,
  surnameStem,
  type DuplicateMatchPerson,
} from "./duplicate-match.js";
import type { HistoricalDate } from "./person.js";

function date(earliest: string, latest = earliest): HistoricalDate {
  return { original: earliest, earliest, latest };
}

let nextId = 0;
function person(overrides: Partial<DuplicateMatchPerson> = {}): DuplicateMatchPerson {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    given: "Søren",
    surname: "Jensen",
    gender: "M",
    otherNames: [],
    birth: null,
    birthPlace: null,
    death: null,
    deathPlace: null,
    parents: [],
    spouses: [],
    relativeIds: new Set(),
    ...overrides,
  };
}

describe("name folding", () => {
  it("spells out æ/ø/å and drops punctuation", () => {
    expect(foldName("  Søren  Bjørn-Ærø ")).toBe("soeren bjoern aeroe");
    expect(foldName("Sören")).toBe(foldName("Søren"));
    expect(foldName("Åge")).toBe("aage");
  });

  it("gives Danish spelling variants the same sound key", () => {
    expect(soundKey("Christensen")).toBe(soundKey("Kristensen"));
    expect(soundKey("Petersen")).toBe(soundKey("Pedersen"));
    expect(soundKey("Nielsen")).toBe(soundKey("Nilsen"));
    expect(soundKey("Mathias")).toBe(soundKey("Matthias"));
    expect(soundKey("Aage")).toBe(soundKey("Åge"));
    expect(soundKey("Carl")).toBe(soundKey("Karl"));
    expect(soundKey("Jens")).not.toBe(soundKey("Hans"));
  });

  it("brings a patronymic son and daughter to the same stem", () => {
    expect(surnameStem("Sørensen")).toBe(surnameStem("Sørensdatter"));
    expect(surnameStem("Jensen")).toBe(surnameStem("Jens dtr."));
    expect(surnameStem("Pedersen")).toBe(surnameStem("Pedersdatter"));
    expect(surnameStem("Hansen")).not.toBe(surnameStem("Jensen"));
  });

  it("keys the import preview's name matching on sound, and not without a surname", () => {
    expect(nameMatchKey({ given: "Kristian", surname: "Christensen" })).toBe(
      nameMatchKey({ given: "Christian", surname: "Kristensen" }),
    );
    expect(nameMatchKey({ given: "Maren", surname: "" })).toBeNull();
  });
});

describe("compareDates", () => {
  it("tells exact, close, unknown and conflicting dates apart", () => {
    expect(compareDates(date("1801-03-04"), date("1801-03-04"))).toBe("same");
    expect(compareDates(date("1801-01-01", "1801-12-31"), date("1801-03-04"))).toBe("similar");
    expect(compareDates(date("1801-03-04"), date("1802-06-01"))).toBe("similar");
    expect(compareDates(date("1801-03-04"), date("1805-01-01"))).toBeNull();
    expect(compareDates(date("1801-03-04"), date("1820-01-01"))).toBe("conflict");
    expect(compareDates(null, date("1801-03-04"))).toBeNull();
  });
});

describe("scoreDuplicate", () => {
  it("rates a bare name match low", () => {
    expect(scoreDuplicate(person(), person())).toMatchObject({
      confidence: "low",
      reasons: ["sameName"],
    });
  });

  it("rates a spelling variant with a close birth medium", () => {
    const match = scoreDuplicate(
      person({
        given: "Kristian",
        surname: "Christensen",
        birth: date("1801-01-01", "1801-12-31"),
      }),
      person({ given: "Christian", surname: "Kristensen", birth: date("1801-05-02") }),
    );
    expect(match).toMatchObject({
      confidence: "medium",
      reasons: ["similarName", "similarBirthDate"],
    });
  });

  it("rates an identical birth date high", () => {
    const match = scoreDuplicate(
      person({ birth: date("1801-05-02"), birthPlace: "Brande, Ringkøbing" }),
      person({ birth: date("1801-05-02"), birthPlace: "Brande" }),
    );
    expect(match).toMatchObject({
      confidence: "high",
      reasons: ["sameName", "sameBirthDate", "sameBirthPlace"],
    });
  });

  it("matches a married woman through her alternate birth name", () => {
    const match = scoreDuplicate(
      person({
        given: "Maren",
        surname: "Hansen",
        gender: "F",
        otherNames: [{ given: "Maren", surname: "Sørensdatter" }],
        birth: date("1790-01-01", "1790-12-31"),
      }),
      person({ given: "Maren", surname: "Sørensen", gender: "F", birth: date("1790-08-01") }),
    );
    expect(match?.confidence).toBe("medium");
  });

  it("matches on parents' and spouses' names, even across duplicated parents", () => {
    const match = scoreDuplicate(
      person({
        parents: [{ id: "p1", given: "Jens", surname: "Pedersen" }],
        spouses: [{ id: "s1", given: "Ane", surname: "Nielsdatter" }],
      }),
      person({
        parents: [{ id: "p2", given: "Jens", surname: "Petersen" }],
        spouses: [{ id: "s2", given: "Ane", surname: "Nielsdatter" }],
      }),
    );
    expect(match).toMatchObject({ confidence: "high" });
    expect(match?.reasons).toEqual(["sameName", "sameParents", "sameSpouse"]);
  });

  it("rules out different genders, distant dates and relatives", () => {
    expect(scoreDuplicate(person(), person({ gender: "F" }))).toBeNull();
    expect(
      scoreDuplicate(person({ birth: date("1801-01-01") }), person({ birth: date("1830-01-01") })),
    ).toBeNull();
    const child = person();
    expect(scoreDuplicate(person({ relativeIds: new Set([child.id]) }), child)).toBeNull();
    expect(scoreDuplicate(person({ given: "Jens" }), person({ given: "Hans" }))).toBeNull();
  });

  it("doesn't mistake a sibling given a dead child's name for a duplicate", () => {
    const parents = [{ id: "p1", given: "Jens", surname: "Pedersen" }];
    expect(
      scoreDuplicate(
        person({ parents, birth: date("1801-01-01") }),
        person({ parents, birth: date("1804-06-01") }),
      ),
    ).toBeNull();
  });

  it("needs more than a given name when the surnames differ", () => {
    expect(scoreDuplicate(person({ surname: "Jensen" }), person({ surname: "Hansen" }))).toBeNull();
  });
});

describe("findDuplicatePairs", () => {
  const a = person({ birth: date("1801-05-02") });
  const b = person({ birth: date("1801-05-02") });
  const c = person();
  const unrelated = person({ given: "Ane", surname: "Madsen", gender: "F" });

  it("finds every pair, best first", () => {
    const pairs = findDuplicatePairs([a, b, c, unrelated]);
    expect(pairs.map((pair) => pair.confidence)).toEqual(["high", "low", "low"]);
    expect(new Set([pairs[0]!.aId, pairs[0]!.bId])).toEqual(new Set([a.id, b.id]));
  });

  it("leaves out bare name matches on a common name, but not corroborated ones", () => {
    const parish = Array.from({ length: 5 }, () => person({ given: "Jens", surname: "Jensen" }));
    const twins = [
      person({ given: "Jens", surname: "Jensen", birth: date("1801-05-02") }),
      person({ given: "Jens", surname: "Jensen", birth: date("1801-05-02") }),
    ];
    const pairs = findDuplicatePairs([...parish, ...twins]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.confidence).toBe("high");
  });

  it("limits to one person's pairs and skips dismissed ones", () => {
    const pairs = findDuplicatePairs([a, b, c, unrelated], {
      onlyId: c.id,
      isDismissed: (x, y) => [x, y].includes(a.id),
    });
    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.aId, pairs[0]!.bId]).toContain(b.id);
  });
});
