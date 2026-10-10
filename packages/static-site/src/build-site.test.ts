import { posix } from "node:path";

import { DEFAULT_THEME, defaultTreeSettings, type HistoricalDate } from "@genealogy/core";
import { describe, expect, it } from "vitest";

import { buildSite } from "./build-site.js";
import { redactSiteData } from "./redact.js";
import type { TreeData } from "./tree-data.js";
import type { SiteCitation, SiteData, SiteEvent, SitePerson } from "./types.js";

function date(original: string, iso: string | null = null): HistoricalDate {
  return { original, earliest: iso, latest: iso };
}

function cite(sourceId: string, page: string | null = null): SiteCitation {
  return {
    sourceId,
    page,
    volume: null,
    entryId: null,
    certificateNumber: null,
    confidence: "High",
    note: null,
  };
}

function event(eventType: string, overrides: Partial<SiteEvent> = {}): SiteEvent {
  return {
    eventType,
    typeLabel: eventType[0]!.toUpperCase() + eventType.slice(1),
    label: null,
    date: null,
    place: null,
    details: null,
    notes: null,
    citations: [],
    ...overrides,
  };
}

function person(id: string, overrides: Partial<SitePerson> = {}): SitePerson {
  return {
    id,
    given: id,
    surname: "Jensen",
    titlePrefix: null,
    suffix: null,
    gender: "U",
    isLiving: false,
    photo: null,
    notes: null,
    names: [],
    events: [],
    citations: [],
    ...overrides,
  };
}

/**
 * Anders and Karen (deceased) are married, with a son Hans (deceased) and a
 * living daughter Mette, who is married to the deceased Ole. Everything
 * secret about Mette is spelled with SECRET so a leak is easy to spot.
 */
function fixture(): SiteData {
  return {
    title: "The Jensen family",
    exportedAt: "2026-10-10T12:00:00.000Z",
    language: "en",
    startPersonId: "ANDERS",
    treeSettings: defaultTreeSettings,
    theme: DEFAULT_THEME.definition,
    people: [
      person("ANDERS", {
        given: "Anders",
        gender: "M",
        photo: "assets/photos/ANDERS.jpg",
        notes: "**Farmer** at Brande. <script>alert(1)</script> [bad](javascript:alert(1))",
        events: [
          event("birth", {
            date: date("12 MAR 1850", "1850-03-12"),
            place: "Brande",
            citations: [cite("church-book", "17")],
          }),
          event("death", { date: date("1921", "1921-01-01") }),
          event("occupation", {
            date: date("1880", "1880-01-01"),
            details: { employer: "Brande Mølle" },
          }),
        ],
      }),
      person("KAREN", {
        given: "Karen",
        surname: "Nielsen",
        gender: "F",
        names: [
          {
            typeLabel: "Birth name",
            given: "Karen",
            surname: "Pedersen",
            since: null,
            notes: null,
            citations: [],
          },
        ],
      }),
      person("HANS", { given: "Hans", gender: "M" }),
      person("METTE", {
        given: "Mette",
        gender: "F",
        isLiving: true,
        photo: "assets/photos/METTE.jpg",
        notes: "SECRET note",
        names: [
          {
            typeLabel: "Married name",
            given: "Mette",
            surname: "SECRETMARRIED",
            since: null,
            notes: null,
            citations: [],
          },
        ],
        events: [
          event("birth", {
            date: date("3 JUN 1990", "1990-06-03"),
            place: "SECRETTOWN",
            citations: [cite("mette-certificate")],
          }),
        ],
        citations: [cite("mette-certificate")],
      }),
      person("OLE", { given: "Ole", surname: "Hansen", gender: "M" }),
      person("ODD", { given: '<img src=x onerror="alert(1)">', surname: "Smith & Sons" }),
    ],
    parentEdges: [
      { parentId: "ANDERS", childId: "HANS", parentage: "birth", parentageLabel: "Birth" },
      { parentId: "KAREN", childId: "HANS", parentage: "birth", parentageLabel: "Birth" },
      { parentId: "ANDERS", childId: "METTE", parentage: "adopted", parentageLabel: "Adopted" },
      { parentId: "KAREN", childId: "METTE", parentage: "birth", parentageLabel: "Birth" },
    ],
    spouseEdges: [
      ["ANDERS", "KAREN"],
      ["METTE", "OLE"],
    ],
    unions: [
      {
        partnerIds: ["ANDERS", "KAREN"],
        statusLabel: "Married",
        startDate: date("1875", "1875-01-01"),
        startPlace: "Brande",
        endDate: null,
        endPlace: null,
        notes: null,
        citations: [cite("marriages")],
      },
      {
        partnerIds: ["METTE", "OLE"],
        statusLabel: "Married",
        startDate: date("2015", "2015-01-01"),
        startPlace: "SECRETCHURCH",
        endDate: null,
        endPlace: null,
        notes: "SECRET wedding",
        citations: [cite("mette-wedding")],
      },
    ],
    sources: [
      {
        id: "church-book",
        title: "Brande church book",
        author: null,
        publication: null,
        sourceType: "Parish register",
        repository: "Rigsarkivet",
        callNumber: "C 123",
      },
      {
        id: "marriages",
        title: "Marriage register",
        author: null,
        publication: null,
        sourceType: null,
        repository: null,
        callNumber: null,
      },
      {
        id: "mette-certificate",
        title: "SECRET birth certificate of Mette",
        author: null,
        publication: null,
        sourceType: null,
        repository: null,
        callNumber: null,
      },
      {
        id: "mette-wedding",
        title: "SECRET wedding announcement",
        author: null,
        publication: null,
        sourceType: null,
        repository: null,
        callNumber: null,
      },
    ],
  };
}

/** Everything the site's caller adds beside `buildSite`'s own files. */
const CALLER_FILES = ["assets/tree.js", "assets/site.css", "assets/photos/ANDERS.jpg"];

function idsIn(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!));
}

function treeDataOf(files: Map<string, string>): TreeData {
  const script = files.get("data/tree.js")!;
  expect(script.startsWith("window.TREE_DATA = ")).toBe(true);
  return JSON.parse(script.slice("window.TREE_DATA = ".length).trim().replace(/;$/, ""));
}

describe("buildSite", () => {
  it("writes the index, tree, sources, theme and one page per person", () => {
    const files = buildSite(fixture());
    expect([...files.keys()].toSorted()).toEqual([
      "assets/theme.css",
      "data/tree.js",
      "index.html",
      "people/ANDERS.html",
      "people/HANS.html",
      "people/KAREN.html",
      "people/METTE.html",
      "people/ODD.html",
      "people/OLE.html",
      "sources.html",
      "tree.html",
    ]);
  });

  describe("privacy", () => {
    it("never writes anything but the name of a living person", () => {
      const files = buildSite(fixture());
      const leaks = [...files].filter(([, contents]) =>
        /SECRET|1990|2015|METTE\.jpg/.test(contents),
      );
      expect(leaks.map(([path]) => path)).toEqual([]);
      expect(files.get("people/METTE.html")).toContain("Mette Jensen");
      expect(files.get("people/METTE.html")).toContain("only the name is shown");
    });

    it("keeps a living person's place in the tree", () => {
      const data = treeDataOf(buildSite(fixture()));
      const mette = data.people.find((entry) => entry.id === "METTE")!;
      expect(mette).toMatchObject({
        birth: null,
        birthPlace: null,
        photoPath: null,
        lifespan: null,
      });
      expect(data.parentEdges).toContainEqual({
        parentId: "KAREN",
        childId: "METTE",
        parentage: "birth",
      });
      expect(data.spouseEdges).toContainEqual(["METTE", "OLE"]);
      expect(buildSite(fixture()).get("people/OLE.html")).toContain('href="METTE.html"');
    });

    it("drops sources only a redacted fact cited", () => {
      const redacted = redactSiteData(fixture());
      expect(redacted.sources.map((source) => source.id).toSorted()).toEqual([
        "church-book",
        "marriages",
      ]);
      expect(redacted.unions).toHaveLength(1);
    });

    it("applies the rule even when the caller didn't redact first", () => {
      // buildSite is given the raw fixture throughout; this states it.
      const files = buildSite(fixture());
      expect(files.get("index.html")).not.toContain("SECRETMARRIED");
    });
  });

  describe("escaping", () => {
    it("escapes names and other text", () => {
      const files = buildSite(fixture());
      const unescaped = [...files].filter(([, contents]) => contents.includes("<img src=x"));
      expect(unescaped.map(([path]) => path)).toEqual([]);
      expect(files.get("people/ODD.html")).toContain("&lt;img src");
      expect(files.get("people/ODD.html")).toContain("Smith &amp; Sons");
    });

    it("renders notes as markdown without passing raw HTML or script links through", () => {
      const page = buildSite(fixture()).get("people/ANDERS.html")!;
      expect(page).toContain("<strong>Farmer</strong>");
      expect(page).not.toContain("<script>alert");
      expect(page).toContain("&lt;script&gt;");
      expect(page).not.toMatch(/href="javascript:/i);
    });

    it("can't end the tree data's script early", () => {
      const script = buildSite(fixture()).get("data/tree.js")!;
      expect(script).not.toContain("<");
      expect(treeDataOf(buildSite(fixture())).people.find((p) => p.id === "ODD")!.given).toBe(
        '<img src=x onerror="alert(1)">',
      );
    });

    it("refuses an id or photo path that isn't safe as a file name", () => {
      const data = fixture();
      data.people.push(person("../evil"));
      expect(() => buildSite(data)).toThrow(/Unsafe person id/);
      const photo = fixture();
      photo.people[0]!.photo = "../../etc/passwd";
      expect(() => buildSite(photo)).toThrow(/Unsafe photo path/);
    });
  });

  describe("links", () => {
    it("are all relative, and every one resolves to a file and anchor in the site", () => {
      const files = buildSite(fixture());
      const known = new Set([...files.keys(), ...CALLER_FILES]);
      const broken: string[] = [];
      let checked = 0;
      for (const [path, contents] of files) {
        if (!path.endsWith(".html")) continue;
        for (const [, target] of contents.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
          checked++;
          // Absolute paths and other origins would break under file:// or
          // in a subfolder.
          if (/^(\/|[a-z]+:)/i.test(target!)) {
            broken.push(`${path} → ${target} (not relative)`);
            continue;
          }
          // Attribute values are HTML: Handlebars writes `=` as `&#x3D;`.
          const url = target!.replaceAll("&#x3D;", "=").replaceAll("&amp;", "&");
          const [withoutHash, hash] = url.split("#") as [string, string | undefined];
          const file = withoutHash.split("?")[0]!;
          const resolved = file === "" ? path : posix.join(posix.dirname(path), file);
          if (!known.has(resolved)) broken.push(`${path} → ${target} (no such file)`);
          else if (hash && files.has(resolved) && !idsIn(files.get(resolved)!).has(hash)) {
            broken.push(`${path} → ${target} (no such anchor)`);
          }
        }
      }
      expect(broken).toEqual([]);
      expect(checked).toBeGreaterThan(50);
    });
  });

  describe("pages", () => {
    it("lists everyone on the index by surname, with lifespans", () => {
      const index = buildSite(fixture()).get("index.html")!;
      expect(index).toContain('href="people/ANDERS.html">Anders Jensen</a>');
      expect(index).toContain("1850–1921");
      expect(index.indexOf(">Hansen<")).toBeLessThan(index.indexOf(">Jensen<"));
      expect(index).toContain("6 people · 2 sources");
      // Alternate names are searchable too.
      expect(index).toMatch(/data-search="karen nielsen karen pedersen"/);
    });

    it("shows a person's vitals, family, events and footnoted sources", () => {
      const page = buildSite(fixture()).get("people/ANDERS.html")!;
      expect(page).toContain("12 March 1850, Brande");
      expect(page).toContain('href="KAREN.html"');
      expect(page).toContain("Married 1875, Brande");
      expect(page).toContain('href="HANS.html"');
      expect(page).toContain("Employer: Brande Mølle");
      expect(page).toContain('href="../sources.html#source-1">Brande church book</a>, page 17');
      expect(page).toContain('src="../assets/photos/ANDERS.jpg"');
    });

    it("labels a parent who isn't a birth parent", () => {
      const page = buildSite(fixture()).get("people/METTE.html")!;
      expect(page).toMatch(/Anders Jensen<\/a>.*\(Adopted\)/);
    });

    it("lists siblings through any shared parent", () => {
      const page = buildSite(fixture()).get("people/HANS.html")!;
      expect(page).toContain('href="METTE.html"');
    });

    it("opens the tree on the start person, else the first A–Z", () => {
      expect(treeDataOf(buildSite(fixture())).startPersonId).toBe("ANDERS");
      expect(treeDataOf(buildSite({ ...fixture(), startPersonId: null })).startPersonId).toBe(
        "OLE",
      );
    });

    it("writes the site in Danish when asked", () => {
      const files = buildSite({ ...fixture(), language: "da" });
      expect(files.get("index.html")).toContain('<html lang="da">');
      expect(files.get("people/ANDERS.html")).toContain("12 marts 1850");
      expect(files.get("index.html")).toContain("Eksporteret 10. oktober 2026");
    });

    it("themes light and dark", () => {
      const css = buildSite(fixture()).get("assets/theme.css")!;
      expect(css).toMatch(/^:root\{/);
      expect(css).toContain("@media (prefers-color-scheme: dark)");
      expect(css).toContain("--primary:");
    });
  });
});
