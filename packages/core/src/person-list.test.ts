import { describe, expect, it } from "vitest";

import {
  nameSearchWords,
  namesMatchSearch,
  nameWordMatches,
  personGroupKey,
} from "./person-list.js";

describe("nameSearchWords", () => {
  it("splits on whitespace and drops empties", () => {
    expect(nameSearchWords("  Søren   Jensen ")).toEqual(["Søren", "Jensen"]);
    expect(nameSearchWords(null)).toEqual([]);
  });
});

describe("nameWordMatches", () => {
  it("matches as a substring either way", () => {
    expect(nameWordMatches("Christensen", "risten", false)).toBe(true);
    expect(nameWordMatches("Christensen", "Kristensen", false)).toBe(false);
  });

  it("with similar spellings, matches Danish variants and half-typed words", () => {
    expect(nameWordMatches("Christensen", "Kristensen", true)).toBe(true);
    expect(nameWordMatches("Christensen", "Kristens", true)).toBe(true);
    expect(nameWordMatches("Nilsen", "Nielsen", true)).toBe(true);
    expect(nameWordMatches("Sören", "Søren", true)).toBe(true);
    expect(nameWordMatches("Sørensdatter", "Sørensen", true)).toBe(true);
    expect(nameWordMatches("Sørensen", "Sorensen", true)).toBe(true);
    expect(nameWordMatches("Hansen", "Jensen", true)).toBe(false);
    // Nielsen is "son of Niels", not Niels himself.
    expect(nameWordMatches("Niels", "Nilsen", true)).toBe(false);
  });
});

describe("namesMatchSearch", () => {
  const maren = [
    { given: "Maren", surname: "Hansen" },
    { given: "Maren", surname: "Sørensdatter" },
  ];

  it("needs every word, from any of the names", () => {
    expect(namesMatchSearch(maren, ["Maren", "Sørensdatter"], false)).toBe(true);
    expect(namesMatchSearch(maren, ["Maren", "Sørensen"], false)).toBe(false);
    expect(namesMatchSearch(maren, ["Maren", "Sørensen"], true)).toBe(true);
    expect(namesMatchSearch(maren, ["Karen"], true)).toBe(false);
  });
});

describe("personGroupKey", () => {
  const person = {
    surname: " Sørensen ",
    birth: { earliest: "1801-03-04", latest: "1801-03-04" },
    birthPlace: "Brande, Ringkøbing, Danmark",
  };

  it("keys by last name, century and parish", () => {
    expect(personGroupKey(person, "surname")).toBe("sørensen");
    expect(personGroupKey(person, "century")).toBe("18");
    expect(personGroupKey(person, "birthplace")).toBe("brande");
    expect(personGroupKey(person, "none")).toBeNull();
  });

  it("is null when there's nothing to group by", () => {
    const blank = { surname: "", birth: null, birthPlace: " " };
    expect(personGroupKey(blank, "surname")).toBeNull();
    expect(personGroupKey(blank, "century")).toBeNull();
    expect(personGroupKey(blank, "birthplace")).toBeNull();
  });
});
