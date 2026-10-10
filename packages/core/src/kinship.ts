import type { Language } from "./profile.js";

/**
 * How someone is related to a chosen person (the "root" — the centre of the
 * tree), worked out from parent and spouse links alone. Framework-free and
 * DOM-free so the tree page (and later anything else, like the static
 * site) can label people the same way; `formatKinship` turns it into words.
 *
 * Blood relationships are found through the closest common ancestor:
 * `up` generations from the root to it, `down` from it to the relative.
 * Everything else the tree shows is one marriage away — a spouse, an
 * in-law, a step-parent — and anything further out is left unlabelled
 * rather than given a long, unreadable chain.
 */
export type Kinship =
  | { kind: "self" }
  | { kind: "spouse" }
  /** `generations` up; `line` is the gender of each ancestor on the way, the root's parent first (Danish farfar/morfar needs it). */
  | { kind: "ancestor"; generations: number; line: Gender[] }
  | { kind: "descendant"; generations: number }
  | { kind: "sibling"; half: boolean }
  /** An aunt/uncle `generations` above the parents' generation (1 = aunt/uncle); `side` is the root's parent they're related through. */
  | { kind: "pibling"; generations: number; side: Gender; byMarriage: boolean }
  /** A niece/nephew, `generations` below the siblings' (1 = niece/nephew). */
  | { kind: "nibling"; generations: number }
  | { kind: "cousin"; degree: number; removed: number }
  | { kind: "parentInLaw" }
  | { kind: "childInLaw" }
  | { kind: "siblingInLaw" }
  | { kind: "stepParent" }
  | { kind: "stepChild" };

type Gender = "M" | "F" | "U";

export interface KinshipGraph {
  people: ReadonlyArray<{ id: string; gender: string }>;
  parentEdges: ReadonlyArray<{ parentId: string; childId: string }>;
  spouseEdges: ReadonlyArray<readonly [string, string]>;
}

/** Deep enough for any real tree, and a guard against a cycle in bad data (someone recorded as their own ancestor). */
const MAX_GENERATIONS = 30;

function toGender(value: string | undefined): Gender {
  return value === "M" || value === "F" ? value : "U";
}

function addTo(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Every ancestor of `start` (and `start` itself at 0), each at its shortest distance, with the path genders. */
function ancestorsOf(
  start: string,
  parentsOf: Map<string, string[]>,
  genderOf: (id: string) => Gender,
): Map<string, { distance: number; line: Gender[] }> {
  const found = new Map([[start, { distance: 0, line: [] as Gender[] }]]);
  let frontier = [start];
  for (let distance = 1; distance <= MAX_GENERATIONS && frontier.length > 0; distance += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parentId of parentsOf.get(id) ?? []) {
        if (found.has(parentId)) continue;
        found.set(parentId, {
          distance,
          line: [...found.get(id)!.line, genderOf(parentId)],
        });
        next.push(parentId);
      }
    }
    frontier = next;
  }
  return found;
}

/**
 * Everyone in `graph` the root is related to, by id. People with no
 * relationship this can name are left out of the map.
 */
export function kinshipsFrom(rootId: string, graph: KinshipGraph): Map<string, Kinship> {
  const genders = new Map(graph.people.map((person) => [person.id, toGender(person.gender)]));
  const genderOf = (id: string) => genders.get(id) ?? "U";
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  for (const edge of graph.parentEdges) {
    addTo(parentsOf, edge.childId, edge.parentId);
    addTo(childrenOf, edge.parentId, edge.childId);
  }
  for (const [a, b] of graph.spouseEdges) {
    addTo(spousesOf, a, b);
    addTo(spousesOf, b, a);
  }

  const rootAncestors = ancestorsOf(rootId, parentsOf, genderOf);
  const rootParents = new Set(parentsOf.get(rootId) ?? []);

  const blood = (id: string): Kinship | null => {
    // The closest common ancestor: fewest steps in all, then the fewest up
    // from the root (so a niece isn't read as a cousin through a further
    // ancestor in a tree with cousin marriages).
    let best: { up: number; down: number; line: Gender[] } | null = null;
    for (const [ancestorId, { distance: down }] of ancestorsOf(id, parentsOf, genderOf)) {
      const fromRoot = rootAncestors.get(ancestorId);
      if (!fromRoot) continue;
      const up = fromRoot.distance;
      if (
        !best ||
        up + down < best.up + best.down ||
        (up + down === best.up + best.down && up < best.up)
      ) {
        best = { up, down, line: fromRoot.line };
      }
    }
    if (!best) return null;
    const { up, down, line } = best;
    if (up === 0 && down === 0) return { kind: "self" };
    if (down === 0) return { kind: "ancestor", generations: up, line };
    if (up === 0) return { kind: "descendant", generations: down };
    if (up === 1 && down === 1) {
      const theirParents = parentsOf.get(id) ?? [];
      const shared = theirParents.filter((parentId) => rootParents.has(parentId)).length;
      // Half only when we know of a parent they don't share; one recorded
      // parent each is just a sibling with a gap in the research.
      const half = shared === 1 && (rootParents.size >= 2 || theirParents.length >= 2);
      return { kind: "sibling", half };
    }
    if (down === 1) {
      return { kind: "pibling", generations: up - 1, side: line[0] ?? "U", byMarriage: false };
    }
    if (up === 1) return { kind: "nibling", generations: down - 1 };
    return { kind: "cousin", degree: Math.min(up, down) - 1, removed: Math.abs(up - down) };
  };

  const result = new Map<string, Kinship>();
  for (const person of graph.people) {
    const kinship = blood(person.id);
    if (kinship) result.set(person.id, kinship);
  }

  // One marriage away: the spouses of the root's blood relatives, and the
  // blood relatives of the root's spouses. Blood wins where both apply.
  const rootSpouses = spousesOf.get(rootId) ?? [];
  const setIfFree = (id: string, kinship: Kinship) => {
    if (!result.has(id)) result.set(id, kinship);
  };
  for (const spouseId of rootSpouses) setIfFree(spouseId, { kind: "spouse" });
  // A snapshot of the blood relatives: iterating the live map would also
  // visit the in-laws this loop adds, and label their spouses in turn.
  const bloodRelatives = Array.from(result);
  for (const [relativeId, kinship] of bloodRelatives) {
    for (const spouseId of spousesOf.get(relativeId) ?? []) {
      if (kinship.kind === "ancestor" && kinship.generations === 1) {
        setIfFree(spouseId, { kind: "stepParent" });
      } else if (kinship.kind === "descendant" && kinship.generations === 1) {
        setIfFree(spouseId, { kind: "childInLaw" });
      } else if (kinship.kind === "sibling") {
        setIfFree(spouseId, { kind: "siblingInLaw" });
      } else if (kinship.kind === "pibling") {
        setIfFree(spouseId, { ...kinship, byMarriage: true });
      }
    }
  }
  for (const spouseId of rootSpouses) {
    for (const parentId of parentsOf.get(spouseId) ?? [])
      setIfFree(parentId, { kind: "parentInLaw" });
    for (const childId of childrenOf.get(spouseId) ?? []) setIfFree(childId, { kind: "stepChild" });
    for (const parentId of parentsOf.get(spouseId) ?? []) {
      for (const siblingId of childrenOf.get(parentId) ?? []) {
        if (siblingId !== spouseId) setIfFree(siblingId, { kind: "siblingInLaw" });
      }
    }
  }
  return result;
}

/** Male, female and unknown wordings of one relationship. */
type Words = readonly [male: string, female: string, unknown: string];

function pick(words: Words, gender: Gender): string {
  return gender === "M" ? words[0] : gender === "F" ? words[1] : words[2];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "great-" for one, "2nd great-" for two, ... — the English prefix for `n` extra generations. */
function greats(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "great-" : `${ordinal(n)} great-`;
}

function formatEnglish(kinship: Kinship, gender: Gender): string | null {
  switch (kinship.kind) {
    case "self":
      return null;
    case "spouse":
      return pick(["husband", "wife", "spouse"], gender);
    case "ancestor": {
      const base = pick(["father", "mother", "parent"], gender);
      if (kinship.generations === 1) return base;
      return `${greats(kinship.generations - 2)}grand${base}`;
    }
    case "descendant": {
      const n = kinship.generations;
      if (n === 1) return pick(["son", "daughter", "child"], gender);
      return `${greats(n - 2)}grand${pick(["son", "daughter", "child"], gender)}`;
    }
    case "sibling":
      return `${kinship.half ? "half-" : ""}${pick(["brother", "sister", "sibling"], gender)}`;
    case "pibling":
      return `${greats(kinship.generations - 1)}${pick(["uncle", "aunt", "aunt/uncle"], gender)}`;
    case "nibling":
      return `${greats(kinship.generations - 1)}${pick(["nephew", "niece", "niece/nephew"], gender)}`;
    case "cousin": {
      const base = kinship.degree === 1 ? "cousin" : `${ordinal(kinship.degree)} cousin`;
      const r = kinship.removed;
      if (r === 0) return base;
      return `${base} ${r === 1 ? "once" : r === 2 ? "twice" : `${r}×`} removed`;
    }
    case "parentInLaw":
      return `${pick(["father", "mother", "parent"], gender)}-in-law`;
    case "childInLaw":
      return `${pick(["son", "daughter", "child"], gender)}-in-law`;
    case "siblingInLaw":
      return `${pick(["brother", "sister", "sibling"], gender)}-in-law`;
    case "stepParent":
      return pick(["stepfather", "stepmother", "step-parent"], gender);
    case "stepChild":
      return pick(["stepson", "stepdaughter", "stepchild"], gender);
  }
}

/** Danish "olde-" generations: olde, tipolde, tiptipolde, ... — past three tips it's a numbered generation instead. */
function olde(extra: number): string | null {
  if (extra < 0) return "";
  if (extra > 3) return null;
  return `${"tip".repeat(extra)}olde`;
}

function formatDanish(kinship: Kinship, gender: Gender): string | null {
  switch (kinship.kind) {
    case "self":
      return null;
    case "spouse":
      return pick(["ægtemand", "hustru", "ægtefælle"], gender);
    case "ancestor": {
      const n = kinship.generations;
      const base = pick(["far", "mor", "forælder"], gender);
      if (n === 1) return base;
      if (n === 2) {
        // Farfar, farmor, morfar, mormor — the side is part of the word.
        const side = kinship.line[0];
        if (side === "M" || side === "F") return `${side === "M" ? "far" : "mor"}${base}`;
        return `bedste${base}`;
      }
      const prefix = olde(n - 3);
      return prefix === null ? `ane i ${n}. generation` : `${prefix}${base}`;
    }
    case "descendant": {
      const n = kinship.generations;
      if (n === 1) return pick(["søn", "datter", "barn"], gender);
      if (n === 2) return "barnebarn";
      const prefix = olde(n - 3);
      return prefix === null ? `efterkommer i ${n}. generation` : `${prefix}barn`;
    }
    case "sibling":
      return `${kinship.half ? "halv" : ""}${pick(["bror", "søster", "søskende"], gender)}`;
    case "pibling": {
      const n = kinship.generations;
      if (n === 1) {
        // Farbror/faster on the father's side, morbror/moster on the
        // mother's — but an aunt or uncle by marriage is just onkel/tante.
        if (!kinship.byMarriage && (kinship.side === "M" || kinship.side === "F")) {
          const side = kinship.side === "M" ? "far" : "mor";
          return pick(
            [`${side}bror`, `${side === "far" ? "fa" : "mo"}ster`, `${side}s søskende`],
            gender,
          );
        }
        return pick(["onkel", "tante", "onkel/tante"], gender);
      }
      const prefix = n === 2 ? "grand" : olde(n - 3);
      return prefix === null ? null : `${prefix}${pick(["onkel", "tante", "onkel/tante"], gender)}`;
    }
    case "nibling": {
      const n = kinship.generations;
      const prefix = n === 1 ? "" : n === 2 ? "grand" : olde(n - 3);
      return prefix === null ? null : `${prefix}${pick(["nevø", "niece", "nevø/niece"], gender)}`;
    }
    case "cousin": {
      const d = kinship.degree;
      const base =
        d === 1
          ? pick(["fætter", "kusine", "fætter/kusine"], gender)
          : d === 2
            ? "næstsøskendebarn"
            : d === 3
              ? "tredjesøskendebarn"
              : `${d}.-søskendebarn`;
      return kinship.removed === 0 ? base : `${base}, ${kinship.removed} gen. forskudt`;
    }
    case "parentInLaw":
      return pick(["svigerfar", "svigermor", "svigerforælder"], gender);
    case "childInLaw":
      return pick(["svigersøn", "svigerdatter", "svigerbarn"], gender);
    case "siblingInLaw":
      return pick(["svoger", "svigerinde", "svoger/svigerinde"], gender);
    case "stepParent":
      return pick(["stedfar", "stedmor", "stedforælder"], gender);
    case "stepChild":
      return pick(["stedsøn", "steddatter", "stedbarn"], gender);
  }
}

/**
 * A relationship in words, for a person of `gender` — "2nd great-grandfather",
 * "Cousin once removed", "Farmor", "Morbror". Composed here rather than in
 * the i18n files because the words are built from parts (greats, tips,
 * ordinals, which side of the family). `null` for the root themselves.
 */
export function formatKinship(kinship: Kinship, gender: string, language: Language): string | null {
  const words =
    language === "da"
      ? formatDanish(kinship, toGender(gender))
      : formatEnglish(kinship, toGender(gender));
  return words === null ? null : capitalize(words);
}
