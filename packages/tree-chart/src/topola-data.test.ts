import { describe, expect, it } from "vitest";

import {
  chosenParents,
  directLine,
  toTopolaJson,
  treeCard,
  type TopolaSourcePerson,
  type TreeCardOptions,
} from "./topola-data";

function person(id: string, gender: string, extra: Partial<TopolaSourcePerson> = {}) {
  return {
    id,
    given: id,
    surname: "",
    gender,
    isLiving: true,
    birth: null,
    birthPlace: null,
    death: null,
    deathPlace: null,
    photoPath: null,
    ...extra,
  } satisfies TopolaSourcePerson;
}

const born = (iso: string) => ({ original: iso, earliest: iso, latest: iso });

const url = (path: string) => `/uploads/${path}`;

const options = {
  formatDate: (date: { original: string }) => date.original,
  photoUrl: (path: string) => `/uploads/${path}`,
};

const genders: Record<string, string> = { dad: "M", mum: "F", step: "M", x: "U", y: "U" };
const genderOf = (id: string) => genders[id];

describe("chosenParents", () => {
  it("prefers birth parents over adoptive or step ones", () => {
    expect(
      chosenParents(
        [
          { parentId: "step", parentage: "step" },
          { parentId: "dad", parentage: "birth" },
          { parentId: "mum", parentage: "birth" },
        ],
        genderOf,
      ),
    ).toEqual(["dad", "mum"]);
  });

  it("falls back to unknown, then adopted, then anything else", () => {
    expect(
      chosenParents(
        [
          { parentId: "step", parentage: "step" },
          { parentId: "mum", parentage: "adopted" },
        ],
        genderOf,
      ),
    ).toEqual(["mum"]);
    expect(
      chosenParents(
        [
          { parentId: "mum", parentage: "adopted" },
          { parentId: "dad", parentage: "unknown" },
        ],
        genderOf,
      ),
    ).toEqual(["dad"]);
    expect(chosenParents([{ parentId: "step", parentage: "foster" }], genderOf)).toEqual(["step"]);
  });

  it("keeps a father and a mother when one group has more than two", () => {
    expect(
      chosenParents(
        [
          { parentId: "step", parentage: "birth" },
          { parentId: "x", parentage: "birth" },
          { parentId: "mum", parentage: "birth" },
        ],
        genderOf,
      ),
    ).toEqual(["step", "mum"]);
  });
});

describe("toTopolaJson", () => {
  it("joins a child's parents and their marriage into one family", () => {
    const json = toTopolaJson(
      {
        people: [person("dad", "M"), person("mum", "F"), person("kid", "U")],
        parentEdges: [
          { parentId: "dad", childId: "kid", parentage: "birth" },
          { parentId: "mum", childId: "kid", parentage: "birth" },
        ],
        spouseEdges: [["mum", "dad"]],
      },
      options,
    );
    expect(json.fams).toEqual([{ id: "F:dad+mum", husb: "dad", wife: "mum", children: ["kid"] }]);
    expect(json.indis.find((indi) => indi.id === "kid")?.famc).toBe("F:dad+mum");
    expect(json.indis.find((indi) => indi.id === "dad")?.fams).toEqual(["F:dad+mum"]);
  });

  it("gives a childless couple and a lone parent their own families", () => {
    const json = toTopolaJson(
      {
        people: [person("dad", "M"), person("mum", "F"), person("kid", "U")],
        parentEdges: [{ parentId: "mum", childId: "kid", parentage: "birth" }],
        spouseEdges: [["dad", "mum"]],
      },
      options,
    );
    expect(json.fams).toEqual([
      { id: "F:mum", wife: "mum", children: ["kid"] },
      { id: "F:dad+mum", husb: "dad", wife: "mum", children: [] },
    ]);
    expect(json.indis.find((indi) => indi.id === "mum")?.fams).toEqual(["F:mum", "F:dad+mum"]);
  });

  it("places a same-sex couple stably and ignores links to people not loaded", () => {
    const json = toTopolaJson(
      {
        people: [person("y", "U"), person("x", "U")],
        parentEdges: [{ parentId: "ghost", childId: "x", parentage: "birth" }],
        spouseEdges: [
          ["y", "x"],
          ["x", "ghost"],
        ],
      },
      options,
    );
    expect(json.fams).toEqual([{ id: "F:x+y", husb: "x", wife: "y", children: [] }]);
    expect(json.indis.find((indi) => indi.id === "x")?.famc).toBeUndefined();
  });

  it("lists children oldest first, undated last", () => {
    const json = toTopolaJson(
      {
        people: [
          person("mum", "F"),
          person("c", "U"),
          person("a", "U", { birth: born("1902-01-01") }),
          person("b", "U", { birth: born("1899-05-05") }),
        ],
        parentEdges: ["c", "a", "b"].map((childId) => ({
          parentId: "mum",
          childId,
          parentage: "birth",
        })),
        spouseEdges: [],
      },
      options,
    );
    expect(json.fams[0]?.children).toEqual(["b", "a", "c"]);
  });

  it("maps vitals, photo and a deceased person with no recorded death", () => {
    const json = toTopolaJson(
      {
        people: [
          person("dad", "M", {
            isLiving: false,
            birth: { original: "abt 1850", earliest: "1848-01-01", latest: "1852-12-31" },
            birthPlace: "Ribe",
            photoPath: "dad.jpg",
          }),
          person("x", "U", { isLiving: false, deathPlace: "Esbjerg" }),
        ],
        parentEdges: [],
        spouseEdges: [],
      },
      options,
    );
    const [dad, x] = json.indis;
    expect(dad).toMatchObject({
      sex: "M",
      birth: { date: { text: "abt 1850" }, place: "Ribe" },
      death: { confirmed: true },
      images: [{ url: "/uploads/dad.jpg" }],
      hideId: true,
      hideSex: true,
    });
    expect(x?.sex).toBeUndefined();
    expect(x?.death).toEqual({ place: "Esbjerg" });
  });
});

function cardOptions(overrides: Partial<TreeCardOptions> = {}): TreeCardOptions {
  return {
    name: "Anders Jensen",
    photoUrl: url,
    formatDate: (date) => `full:${date.original}`,
    dateDetail: "years",
    isDirectLine: false,
    canLoadParents: false,
    canLoadChildren: false,
    ...overrides,
  };
}

const anders = person("dad", "M", {
  given: "Anders",
  surname: "Jensen",
  isLiving: false,
  birth: born("1850-03-03"),
  death: born("1921-01-01"),
  birthPlace: "Ribe",
});

describe("treeCard", () => {
  it("shows years with * and † on one line, then the birth place, and initials", () => {
    expect(treeCard(anders, cardOptions({ isDirectLine: true }))).toEqual({
      name: "Anders Jensen",
      lines: ["* 1850   † 1921", "Ribe"],
      gender: "M",
      photoUrl: null,
      initials: "AJ",
      isDeceased: true,
      isDirectLine: true,
      canLoadParents: false,
      canLoadChildren: false,
    });
  });

  it("gives each full date its own line, and the place only when there's room", () => {
    expect(treeCard(anders, cardOptions({ dateDetail: "full" })).lines).toEqual([
      "* full:1850-03-03",
      "† full:1921-01-01",
    ]);
    const living = person("y", "F", { birth: born("1990-01-01"), birthPlace: "Odense" });
    expect(treeCard(living, cardOptions({ dateDetail: "full" })).lines).toEqual([
      "* full:1990-01-01",
      "Odense",
    ]);
  });

  it("marks a deceased person with no death date, and leaves a living one's empty", () => {
    expect(treeCard(person("x", "U", { isLiving: false }), cardOptions()).lines).toEqual(["†"]);
    const living = treeCard(
      person("y", "F", { given: "", surname: "", photoPath: "y.jpg" }),
      cardOptions(),
    );
    expect(living).toMatchObject({
      lines: [],
      initials: "?",
      photoUrl: "/uploads/y.jpg",
      isDeceased: false,
    });
  });
});

describe("directLine", () => {
  it("takes ancestors and descendants, not siblings or in-laws", () => {
    const edges = [
      { parentId: "gp", childId: "dad" },
      { parentId: "gp", childId: "uncle" },
      { parentId: "dad", childId: "me" },
      { parentId: "me", childId: "kid" },
      { parentId: "inlaw", childId: "kid" },
    ];
    expect(directLine("me", edges)).toEqual(new Set(["me", "dad", "gp", "kid"]));
  });
});
