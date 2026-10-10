import { DEFAULT_THEME, defaultTreeSettings } from "@genealogy/core";
import type {
  CitationRow,
  PersonEventRow,
  PersonNameRow,
  PersonRow,
  UnionRow,
} from "@genealogy/db";
import { describe, expect, it } from "vitest";

import { assembleSiteData, sitePhotoPath, type SiteRows, type SiteSettings } from "./site-data.js";

const created = new Date("2026-01-01T00:00:00Z");

function personRow(id: string, publicId: string, overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id,
    publicId,
    given: publicId,
    surname: "Jensen",
    gender: "U",
    titlePrefix: null,
    suffix: null,
    photoPath: null,
    isLiving: false,
    restriction: null,
    notes: null,
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

function citationRow(overrides: Partial<CitationRow>): CitationRow {
  return {
    id: crypto.randomUUID(),
    sourceId: "source-1",
    personId: "uuid-a",
    factType: "person",
    factId: null,
    page: null,
    volume: null,
    entryId: null,
    certificateNumber: null,
    confidence: "high",
    note: null,
    ancestryApid: null,
    createdAt: created,
    ...overrides,
  };
}

function rows(overrides: Partial<SiteRows> = {}): SiteRows {
  return {
    persons: [
      personRow("uuid-a", "A1", { photoPath: "uuid-a-123.JPEG" }),
      personRow("uuid-b", "B2"),
      personRow("uuid-c", "C3"),
    ],
    names: [
      {
        id: "name-1",
        personId: "uuid-b",
        nameType: "birth",
        given: "Karen",
        surname: "Pedersen",
        since: null,
        notes: null,
        createdAt: created,
      } satisfies PersonNameRow,
    ],
    events: [
      {
        id: "event-1",
        personId: "uuid-a",
        eventType: "birth",
        label: null,
        date: { original: "1850", earliest: "1850-01-01", latest: "1850-12-31" },
        place: "Brande",
        details: null,
        notes: null,
        createdAt: created,
        updatedAt: created,
      } satisfies PersonEventRow,
    ],
    unions: [
      {
        id: "union-1",
        personAId: "uuid-a",
        personBId: "uuid-b",
        status: "married",
        startDate: null,
        startPlace: null,
        endDate: null,
        endPlace: null,
        notes: null,
        createdAt: created,
        updatedAt: created,
      } satisfies UnionRow,
    ],
    sources: [
      {
        id: "source-1",
        title: "Church book",
        author: null,
        publication: null,
        repositoryId: "repo-1",
        callNumber: "C 1",
        sourceType: null,
        createdAt: created,
      },
    ],
    repositories: [
      {
        id: "repo-1",
        name: "Rigsarkivet",
        address: null,
        phone: null,
        email: null,
        website: null,
        createdAt: created,
      },
    ],
    citations: [
      citationRow({ personId: "uuid-a", factType: "person" }),
      citationRow({ personId: "uuid-a", factType: "event", factId: "event-1", page: "17" }),
      citationRow({ personId: "uuid-b", factType: "name", factId: "name-1" }),
      citationRow({ personId: "uuid-a", factType: "union", factId: "union-1" }),
      citationRow({ personId: "uuid-c", factType: "association", factId: "assoc-1" }),
    ],
    parentEdges: [
      { parentId: "uuid-a", childId: "uuid-c", parentage: "birth" },
      // Someone deleted mid-export: dropped, not a dangling id.
      { parentId: "uuid-gone", childId: "uuid-c", parentage: "birth" },
    ],
    spouseEdges: [{ aId: "uuid-a", bId: "uuid-b" }],
    labels: new Map([
      ["event_type", new Map([["birth", "Birth"]])],
      ["name_variant_type", new Map([["birth", "Birth name"]])],
      ["confidence", new Map([["high", "High"]])],
      ["union_status", new Map([["married", "Married"]])],
      ["parentage", new Map([["birth", "Birth"]])],
    ]),
    ...overrides,
  };
}

function settings(overrides: Partial<SiteSettings> = {}): SiteSettings {
  return {
    options: { startPersonId: null, language: "en", title: "Our family" },
    ownPersonId: null,
    treeSettings: defaultTreeSettings,
    theme: DEFAULT_THEME.definition,
    exportedAt: new Date("2026-10-10T12:00:00Z"),
    ...overrides,
  };
}

describe("assembleSiteData", () => {
  it("keys people and edges by publicId, never the database id", () => {
    const data = assembleSiteData(rows(), settings());
    expect(data.people.map((person) => person.id)).toEqual(["A1", "B2", "C3"]);
    expect(data.parentEdges).toEqual([
      { parentId: "A1", childId: "C3", parentage: "birth", parentageLabel: "Birth" },
    ]);
    expect(data.spouseEdges).toEqual([["A1", "B2"]]);
    expect(data.unions[0]!.partnerIds).toEqual(["A1", "B2"]);
    expect(JSON.stringify(data)).not.toContain("uuid-");
  });

  it("turns option keys into their labels, falling back to the key", () => {
    const data = assembleSiteData(rows({ labels: new Map() }), settings());
    expect(data.people[0]!.events[0]!.typeLabel).toBe("birth");
    const labelled = assembleSiteData(rows(), settings());
    expect(labelled.people[0]!.events[0]!.typeLabel).toBe("Birth");
    expect(labelled.unions[0]!.statusLabel).toBe("Married");
    expect(labelled.people[1]!.names[0]!.typeLabel).toBe("Birth name");
  });

  it("attaches each citation to the fact it evidences, and leaves out witness roles", () => {
    const data = assembleSiteData(rows(), settings());
    const [a, b, c] = data.people;
    expect(a!.citations).toHaveLength(1);
    expect(a!.events[0]!.citations).toMatchObject([{ page: "17", confidence: "High" }]);
    expect(b!.names[0]!.citations).toHaveLength(1);
    expect(data.unions[0]!.citations).toHaveLength(1);
    expect(c!.citations).toEqual([]);
  });

  it("names the repository and puts photos under a safe name", () => {
    const data = assembleSiteData(rows(), settings());
    expect(data.sources[0]).toMatchObject({ repository: "Rigsarkivet", callNumber: "C 1" });
    expect(data.people[0]!.photo).toBe("assets/photos/A1.jpeg");
    expect(sitePhotoPath("X9", "no-extension")).toBe("assets/photos/X9.jpg");
    expect(sitePhotoPath("X9", "../../weird name.png")).toBe("assets/photos/X9.png");
  });

  it("starts the tree on the chosen person, else the admin's own, else none", () => {
    expect(assembleSiteData(rows(), settings()).startPersonId).toBeNull();
    expect(assembleSiteData(rows(), settings({ ownPersonId: "uuid-b" })).startPersonId).toBe("B2");
    expect(
      assembleSiteData(
        rows(),
        settings({
          ownPersonId: "uuid-b",
          options: { startPersonId: "uuid-c", language: "en", title: "Our family" },
        }),
      ).startPersonId,
    ).toBe("C3");
  });
});
