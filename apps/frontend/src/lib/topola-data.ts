import type { HistoricalDate, TreeDateDetail } from "@genealogy/core";
import type { JsonEvent, JsonFam, JsonGedcomData, JsonIndi } from "topola";

/** The fields of a tree person this conversion reads — a structural subset of `person.tree`'s rows. */
export interface TopolaSourcePerson {
  id: string;
  given: string;
  surname: string;
  gender: string;
  isLiving: boolean;
  birth: HistoricalDate | null;
  birthPlace: string | null;
  death: HistoricalDate | null;
  deathPlace: string | null;
  photoPath: string | null;
}

export interface TopolaSourceTree {
  people: TopolaSourcePerson[];
  parentEdges: Array<{ parentId: string; childId: string; parentage: string }>;
  spouseEdges: Array<readonly [string, string]>;
}

export interface TopolaConversionOptions {
  /** Our own localized display of a date (e.g. `formatDisplayDate`) — topola's own formatting only knows exact GEDCOM dates and has no Danish qualifiers. */
  formatDate: (date: HistoricalDate) => string | null;
  photoUrl: (photoPath: string) => string;
}

/**
 * Which of a child's parent sets the chart draws, best first. Topola (like
 * GEDCOM's FAMC on most charts) draws exactly one parent family per person,
 * but our data can hold several — birth, adopted, step, foster. Birth
 * parents win; "unknown" comes next because it's what most imported and
 * quickly-added links carry, and is usually a birth parent nobody
 * classified. Every other type ranks after these, in no particular order.
 * The side panel still lists all parents, so nothing is hidden from research.
 */
const PARENTAGE_PREFERENCE = ["birth", "unknown", "adopted"];

function parentageRank(parentage: string): number {
  const index = PARENTAGE_PREFERENCE.indexOf(parentage);
  return index === -1 ? PARENTAGE_PREFERENCE.length : index;
}

/** A family's id is its partners, so a child's parents and a married couple with the same two people are one family. */
function familyId(partnerIds: readonly string[]): string {
  return `F:${partnerIds.toSorted().join("+")}`;
}

/**
 * The parents the chart draws for one child: the best-ranked parentage group,
 * at most two of them (a father and a mother if the group has both). Three
 * parents of the same type only happens with bad data; the extra one is
 * left to the side panel.
 */
export function chosenParents(
  edges: ReadonlyArray<{ parentId: string; parentage: string }>,
  genderOf: (id: string) => string | undefined,
): string[] {
  if (edges.length === 0) return [];
  const bestRank = Math.min(...edges.map((edge) => parentageRank(edge.parentage)));
  const group = edges
    .filter((edge) => parentageRank(edge.parentage) === bestRank)
    .map((edge) => edge.parentId);
  if (group.length <= 2) return group;
  const father = group.find((id) => genderOf(id) === "M");
  const mother = group.find((id) => genderOf(id) === "F");
  if (father && mother) return [father, mother];
  return group.slice(0, 2);
}

/**
 * Topola only has husband/wife slots. A man and a woman go where expected;
 * otherwise (same-sex, unknown gender) the order is just stable. The box
 * colour comes from each person's own `sex`, not the slot, so this only
 * decides left/right placement.
 */
function partnerSlots(
  partnerIds: readonly string[],
  genderOf: (id: string) => string | undefined,
): Pick<JsonFam, "husb" | "wife"> {
  const [a, b] = partnerIds.toSorted() as [string, string | undefined];
  if (b === undefined) return genderOf(a) === "F" ? { wife: a } : { husb: a };
  if (genderOf(a) === "F" && genderOf(b) !== "F") return { husb: b, wife: a };
  return { husb: a, wife: b };
}

/** A topola event, with only the parts we have — `exactOptionalPropertyTypes` rules out `undefined` fields. */
function event(dateText: string | null, place: string | null): JsonEvent | null {
  if (dateText === null && place === null) return null;
  return {
    ...(dateText !== null ? { date: { text: dateText } } : {}),
    ...(place !== null ? { place } : {}),
  };
}

function earliestOf(person: TopolaSourcePerson | undefined): string {
  return person?.birth?.earliest ?? person?.birth?.latest ?? "9999";
}

/**
 * Converts our people + `PARENT_OF`/`SPOUSE_OF` links into topola's
 * GEDCOM-shaped JSON, where people are joined only through families (a
 * couple plus their children). Every couple — married or simply the two
 * parents of the same child — becomes one family; a lone parent is a
 * one-partner family; a couple with no children still gets a family so
 * they're drawn side by side.
 */
export function toTopolaJson(
  tree: TopolaSourceTree,
  options: TopolaConversionOptions,
): JsonGedcomData {
  const peopleById = new Map(tree.people.map((person) => [person.id, person]));
  const genderOf = (id: string) => peopleById.get(id)?.gender;

  const families = new Map<string, JsonFam>();
  const familyFor = (partnerIds: readonly string[]): JsonFam => {
    const id = familyId(partnerIds);
    let family = families.get(id);
    if (!family) {
      family = { id, ...partnerSlots(partnerIds, genderOf), children: [] };
      families.set(id, family);
    }
    return family;
  };

  const edgesByChild = new Map<string, Array<{ parentId: string; parentage: string }>>();
  for (const edge of tree.parentEdges) {
    if (!peopleById.has(edge.parentId) || !peopleById.has(edge.childId)) continue;
    edgesByChild.set(edge.childId, [...(edgesByChild.get(edge.childId) ?? []), edge]);
  }

  const famcByChild = new Map<string, string>();
  for (const [childId, edges] of edgesByChild) {
    const parents = chosenParents(edges, genderOf);
    if (parents.length === 0) continue;
    const family = familyFor(parents);
    family.children!.push(childId);
    famcByChild.set(childId, family.id);
  }

  for (const [a, b] of tree.spouseEdges) {
    if (peopleById.has(a) && peopleById.has(b)) familyFor([a, b]);
  }

  // Oldest first, the way a family group sheet lists children; undated last.
  for (const family of families.values()) {
    family.children!.sort((x, y) =>
      earliestOf(peopleById.get(x)).localeCompare(earliestOf(peopleById.get(y))),
    );
  }

  const famsByPerson = new Map<string, string[]>();
  for (const family of families.values()) {
    for (const partnerId of [family.husb, family.wife]) {
      if (partnerId)
        famsByPerson.set(partnerId, [...(famsByPerson.get(partnerId) ?? []), family.id]);
    }
  }

  const indis = tree.people.map((person): JsonIndi => {
    const birth = event(person.birth ? options.formatDate(person.birth) : null, person.birthPlace);
    // A deceased person with no recorded death still gets topola's bare
    // "+" (`confirmed`), the same signal as the old cards' deceased badge.
    const death =
      event(person.death ? options.formatDate(person.death) : null, person.deathPlace) ??
      (person.isLiving ? null : { confirmed: true });
    const famc = famcByChild.get(person.id);
    const fams = famsByPerson.get(person.id);
    return {
      id: person.id,
      firstName: person.given,
      lastName: person.surname,
      ...(person.gender === "M" || person.gender === "F" ? { sex: person.gender } : {}),
      ...(famc ? { famc } : {}),
      ...(fams ? { fams } : {}),
      ...(birth ? { birth } : {}),
      ...(death ? { death } : {}),
      ...(person.photoPath ? { images: [{ url: options.photoUrl(person.photoPath) }] } : {}),
      // Topola would otherwise print the internal UUID and a ♂/♀ glyph on
      // every box; the colour already says the gender.
      hideId: true,
      hideSex: true,
    };
  });

  return { indis, fams: [...families.values()] };
}

function yearOf(date: HistoricalDate | null): string | null {
  const iso = date?.earliest ?? date?.latest ?? null;
  return iso ? iso.slice(0, 4) : null;
}

/** What a tree card shows — see `CardInfo` in `routes/-tree-card-renderer.ts`. */
export interface TreeCard {
  name: string;
  /** Up to two lines under the name — dates, then place if there's room. */
  lines: string[];
  gender: "M" | "F" | "U";
  photoUrl: string | null;
  initials: string;
  /** Drawn as a black mourning band across the photo's corner. */
  isDeceased: boolean;
  /** One of the centre person's own ancestors or descendants (or them). */
  isDirectLine: boolean;
  /** Their parents / children haven't been fetched yet, and the chart would show them — the card's "+" buttons. */
  canLoadParents: boolean;
  canLoadChildren: boolean;
}

export interface TreeCardOptions {
  name: string;
  photoUrl: (photoPath: string) => string;
  /** Our localized full-date display (`formatDisplayDate`), for `dateDetail: "full"`. */
  formatDate: (date: HistoricalDate) => string | null;
  dateDetail: TreeDateDetail;
  isDirectLine: boolean;
  canLoadParents: boolean;
  canLoadChildren: boolean;
}

/** At most this many lines fit under the name on a card. */
const MAX_CARD_LINES = 2;

/**
 * A card's text, with the genealogical `*` and `†` so it reads the same in
 * every language; a deceased person with no recorded death still gets the
 * `†`. `years` puts both years on one line and the place under it; `full`
 * needs a line per date, so the place only shows when one is missing.
 */
export function treeCard(person: TopolaSourcePerson, options: TreeCardOptions): TreeCard {
  const deathMark = person.isLiving ? null : "†";
  let dates: Array<string | null>;
  if (options.dateDetail === "full") {
    const born = person.birth ? options.formatDate(person.birth) : null;
    const died = person.death ? options.formatDate(person.death) : null;
    dates = [born ? `* ${born}` : null, died ? `† ${died}` : deathMark];
  } else {
    const born = yearOf(person.birth);
    const died = yearOf(person.death);
    const lifespan = [born ? `* ${born}` : null, died ? `† ${died}` : deathMark]
      .filter(Boolean)
      .join("   ");
    dates = [lifespan === "" ? null : lifespan];
  }
  const place = person.birthPlace ?? person.deathPlace;
  const lines = [...dates, place]
    .filter((line): line is string => Boolean(line))
    .slice(0, MAX_CARD_LINES);
  const initials = [person.given, person.surname]
    .map((part) => part.trim().charAt(0).toUpperCase())
    .join("");
  return {
    name: options.name,
    lines,
    gender: person.gender === "M" || person.gender === "F" ? person.gender : "U",
    photoUrl: person.photoPath ? options.photoUrl(person.photoPath) : null,
    initials: initials === "" ? "?" : initials,
    isDeceased: !person.isLiving,
    isDirectLine: options.isDirectLine,
    canLoadParents: options.canLoadParents,
    canLoadChildren: options.canLoadChildren,
  };
}

/**
 * The centre person, everyone above them through parent links and everyone
 * below — the direct line `highlightDirectLine` tints. Spouses and siblings
 * aren't on it unless they're also an ancestor or descendant.
 */
export function directLine(
  rootId: string,
  parentEdges: ReadonlyArray<{ parentId: string; childId: string }>,
): Set<string> {
  const walk = (next: (id: string) => string[]) => {
    const seen = new Set([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      for (const id of next(queue.shift()!)) {
        if (!seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
      }
    }
    return seen;
  };
  const up = walk((id) =>
    parentEdges.filter((edge) => edge.childId === id).map((edge) => edge.parentId),
  );
  const down = walk((id) =>
    parentEdges.filter((edge) => edge.parentId === id).map((edge) => edge.childId),
  );
  return new Set([...up, ...down]);
}
