import { z } from "zod";

import { soundKey, surnameStem } from "./duplicate-match.js";

/**
 * What the People list can be sorted by — one definition for the backend's
 * list input, the server function and the page's URL, which each used to
 * carry their own copy of a combined `"surname_asc" | ...` enum. A closed
 * `z.enum`: each value is a branch in `PersonService.sortColumns`.
 */
export const personListSortSchema = z.enum(["surname", "given", "birth", "death", "age", "place"]);
export type PersonListSort = z.infer<typeof personListSortSchema>;

export const sortDirectionSchema = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

/**
 * The words of a name search: every one must match somewhere in a person's
 * names, so "Søren Jensen" finds Søren Jensen even though no single name
 * field holds both words.
 */
export function nameSearchWords(search: string | null | undefined): string[] {
  return (search ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
}

/**
 * Whether one typed word matches one word of a name. Always as a
 * case-insensitive substring (what the plain search does); with `similar`,
 * also by sound — the word's `soundKey` as a prefix of the name word's, so
 * a half-typed "Kristens" already finds Christensen and "Sorensen" finds
 * Sørensen — or, between two patronymics, the same father's name
 * (Sørensen finds Sørensdatter).
 * The keys are duplicate detection's, so both agree on what "the same
 * name" means.
 */
export function nameWordMatches(nameWord: string, typed: string, similar: boolean): boolean {
  if (nameWord.toLowerCase().includes(typed.toLowerCase())) return true;
  if (!similar) return false;
  const typedKey = soundKey(typed);
  if (typedKey === "") return false;
  if (soundKey(nameWord).startsWith(typedKey)) return true;
  // Sørensen ~ Sørensdatter: both have to be patronymics with the same
  // father's name — "Nielsen" isn't a match for a man called Niels.
  return (
    isPatronymic(nameWord) && isPatronymic(typed) && surnameStem(nameWord) === surnameStem(typed)
  );
}

/** A surname `surnameStem` shortens — it ends in -sen, -datter and the like. */
function isPatronymic(word: string): boolean {
  return surnameStem(word) !== soundKey(word);
}

/**
 * Whether every typed word matches some word of one of a person's names —
 * their primary name or any alternate — the in-memory twin of the People
 * list's SQL name search, used when it's asked for similar spellings.
 */
export function namesMatchSearch(
  names: readonly { given: string; surname: string }[],
  words: readonly string[],
  similar: boolean,
): boolean {
  const nameWords = names.flatMap((name) =>
    `${name.given} ${name.surname}`.split(/\s+/).filter((word) => word !== ""),
  );
  return words.every((typed) =>
    nameWords.some((nameWord) => nameWordMatches(nameWord, typed, similar)),
  );
}

/**
 * What the People list can be grouped by: last name (as written, ignoring
 * case), birth century, or birth parish (the first part of the birthplace —
 * "Brande, Ringkøbing" and "Brande" are one parish). "none" is a real value
 * rather than an absent one, so a site default of "none" can be chosen.
 */
export const peopleListGroupingSchema = z.enum(["none", "surname", "century", "birthplace"]);
export type PeopleListGrouping = z.infer<typeof peopleListGroupingSchema>;

/**
 * The table columns a member can show or hide. The name and the row
 * actions always show; everything else is a choice (Settings → People list
 * sets the default, each member can change their own).
 */
export const peopleListColumnSchema = z.enum([
  "gender",
  "status",
  "age",
  "lifespan",
  "born",
  "died",
  "place",
  "sources",
  "publicId",
]);
export type PeopleListColumn = z.infer<typeof peopleListColumnSchema>;

/**
 * Which group a person falls in, as the key the backend's grouped sort and
 * counts use (`PersonService.groupExpression` — keep the two in step), or
 * null for "no last name" / "undated" / "no birthplace", which sort last.
 */
export function personGroupKey(
  person: {
    surname: string;
    birth: { earliest: string | null; latest: string | null } | null;
    birthPlace: string | null;
  },
  grouping: PeopleListGrouping,
): string | null {
  switch (grouping) {
    case "none":
      return null;
    case "surname": {
      const surname = person.surname.trim().toLowerCase();
      return surname === "" ? null : surname;
    }
    case "century": {
      const iso = person.birth?.earliest ?? person.birth?.latest ?? null;
      return iso ? String(Math.floor(Number.parseInt(iso.slice(0, 4), 10) / 100)) : null;
    }
    case "birthplace": {
      const parish = (person.birthPlace ?? "").split(",")[0]!.trim().toLowerCase();
      return parish === "" ? null : parish;
    }
  }
}
