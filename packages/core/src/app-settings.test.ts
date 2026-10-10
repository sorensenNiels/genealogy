import { describe, expect, it } from "vitest";

import {
  defaultPeopleListSettings,
  applyPeopleListPreferencesChange,
  parsePeopleListPreferences,
  parsePeopleListSettings,
  defaultPersonSettings,
  defaultRecordSettings,
  defaultTreeSettings,
  lastTreeViewSchema,
  parsePersonSettings,
  parseRecordSettings,
  parseTreeSettings,
  treeSettingsSchema,
} from "./app-settings.js";

describe("treeSettingsSchema", () => {
  it("fills every field from its default, so a never-saved section is complete", () => {
    expect(treeSettingsSchema.parse({})).toEqual(defaultTreeSettings);
    expect(defaultTreeSettings.showGenderBadge).toBe(true);
  });

  it("keeps a saved value and ignores keys it no longer knows", () => {
    expect(treeSettingsSchema.parse({ showGenderBadge: false, retired: 1 })).toEqual({
      ...defaultTreeSettings,
      showGenderBadge: false,
    });
  });

  it("rejects a value outside a fixed choice", () => {
    expect(treeSettingsSchema.safeParse({ defaultChart: "fan" }).success).toBe(false);
  });
});

describe("parseTreeSettings", () => {
  it("replaces only a stale field with its default, keeping the rest", () => {
    expect(parseTreeSettings({ defaultChart: "hourglass", showPhotos: false })).toEqual({
      ...defaultTreeSettings,
      defaultChart: "relatives",
      showPhotos: false,
    });
  });

  it("reads anything that isn't an object as all defaults", () => {
    expect(parseTreeSettings(null)).toEqual(defaultTreeSettings);
    expect(parseTreeSettings("nonsense")).toEqual(defaultTreeSettings);
  });
});

describe("lastTreeViewSchema", () => {
  const personId = "8a1d0b5e-3f6c-4c8e-9b2a-1f0e7d6c5b4a";

  it("accepts a stored last view", () => {
    expect(
      lastTreeViewSchema.safeParse({ personId, view: "relatives", orientation: "horizontal" })
        .success,
    ).toBe(true);
  });

  it("rejects a removed chart or a never-saved row, so nothing is remembered", () => {
    expect(
      lastTreeViewSchema.safeParse({ personId, view: "hourglass", orientation: "vertical" })
        .success,
    ).toBe(false);
    expect(
      lastTreeViewSchema.safeParse({ personId: null, view: null, orientation: null }).success,
    ).toBe(false);
  });
});

describe("parsePersonSettings", () => {
  it("defaults to the read view, family events on, and presumed deceased after 110 years", () => {
    expect(parsePersonSettings(undefined)).toEqual(defaultPersonSettings);
    expect(defaultPersonSettings).toEqual({
      openInEditMode: false,
      showFamilyEventsInTimeline: true,
      presumeDeceasedAfterYears: 110,
    });
  });

  it("keeps valid fields and resets an out-of-range age", () => {
    expect(parsePersonSettings({ openInEditMode: true, presumeDeceasedAfterYears: -5 })).toEqual({
      ...defaultPersonSettings,
      openInEditMode: true,
    });
  });
});

describe("parseRecordSettings", () => {
  it("offers every record type and built-in census country, covering Denmark by default", () => {
    expect(defaultRecordSettings.enabledRecordTypes).toEqual([
      "census",
      "baptism",
      "marriage",
      "burial",
    ]);
    expect(defaultRecordSettings.coverageCountries).toEqual(["dk"]);
    expect(defaultRecordSettings.relationshipLinks).toBe("suggest");
  });

  it("keeps a valid custom census and drops a broken settings field", () => {
    const custom = {
      key: "de-1900",
      country: "de",
      year: 1900,
      date: "1900-12-01",
      hasBirthplace: true,
      hasRelationship: true,
    };
    expect(
      parseRecordSettings({ customCensuses: [custom], relationshipLinks: "sometimes" }),
    ).toEqual({ ...defaultRecordSettings, customCensuses: [custom] });
  });
});

describe("parsePeopleListSettings", () => {
  it("defaults to last name A–Z, the table, full dates and two-line rows", () => {
    expect(parsePeopleListSettings(undefined)).toEqual(defaultPeopleListSettings);
    expect(defaultPeopleListSettings).toEqual({
      defaultSort: "surname",
      defaultSortDirection: "asc",
      defaultView: "table",
      dateDetail: "full",
      defaultRowDetail: "detailed",
      detailParents: true,
      detailSpouses: true,
      detailPlaces: true,
      defaultGrouping: "none",
      defaultColumns: [
        "gender",
        "status",
        "age",
        "lifespan",
        "born",
        "died",
        "place",
        "sources",
        "publicId",
      ],
    });
  });

  it("keeps valid saved fields and drops a stale one", () => {
    expect(
      parsePeopleListSettings({ defaultSort: "birth", defaultView: "grid", dateDetail: "years" }),
    ).toEqual({ ...defaultPeopleListSettings, defaultSort: "birth", dateDetail: "years" });
  });
});

describe("parsePeopleListPreferences", () => {
  it("keeps only what the member has chosen, dropping anything no longer valid", () => {
    expect(parsePeopleListPreferences(null)).toEqual({});
    expect(parsePeopleListPreferences({ view: "card", rowDetail: "huge", extra: 1 })).toEqual({
      view: "card",
    });
  });
});

describe("applyPeopleListPreferencesChange", () => {
  it("sets what's given, forgets what's null, keeps the rest", () => {
    expect(
      applyPeopleListPreferencesChange(
        { view: "card", columns: ["age"] },
        { rowDetail: "compact", columns: null },
      ),
    ).toEqual({ view: "card", rowDetail: "compact" });
  });
});
