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
  orderedPersonCards,
  parseOverviewPreferences,
  parseOverviewSettings,
  visibleOverviewCards,
  defaultOverviewSettings,
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
    expect(defaultPersonSettings).toMatchObject({
      openInEditMode: false,
      showFamilyEventsInTimeline: true,
      presumeDeceasedAfterYears: 110,
    });
  });

  it("shows everything as before by default: every card, full dates, ages, name only for Viewers", () => {
    expect(defaultPersonSettings).toMatchObject({
      hiddenCards: [],
      nameFormat: "givenFirst",
      dateDetail: "full",
      showAges: true,
      showHalfSiblings: true,
      showStepRelations: false,
      showInLaws: false,
      viewerLivingDetail: "name",
    });
  });

  it("drops an unknown card from a saved order", () => {
    expect(parsePersonSettings({ cardOrder: ["details", "gallery"] }).cardOrder).toEqual(
      defaultPersonSettings.cardOrder,
    );
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

describe("orderedPersonCards", () => {
  it("is every card in the default order by default", () => {
    expect(orderedPersonCards(defaultPersonSettings)).toEqual([
      "details",
      "photos",
      "lifeEvents",
      "records",
      "citations",
      "associations",
      "researchNotes",
      "family",
      "externalIds",
    ]);
  });

  it("follows a saved order and appends a card the order doesn't mention", () => {
    expect(
      orderedPersonCards({ cardOrder: ["researchNotes", "details", "details"], hiddenCards: [] }),
    ).toEqual([
      "researchNotes",
      "details",
      "photos",
      "lifeEvents",
      "records",
      "citations",
      "associations",
      "family",
      "externalIds",
    ]);
  });

  it("leaves out hidden cards, but never Personal details or Family", () => {
    const cards = orderedPersonCards({
      cardOrder: defaultPersonSettings.cardOrder,
      hiddenCards: ["associations", "externalIds", "details", "family"],
    });
    expect(cards).not.toContain("associations");
    expect(cards).not.toContain("externalIds");
    expect(cards).toContain("details");
    expect(cards).toContain("family");
  });
});

describe("overview settings", () => {
  it("shows every card by default to an admin, the family cards to a viewer", () => {
    expect(parseOverviewSettings(undefined)).toEqual(defaultOverviewSettings);
    expect(visibleOverviewCards(defaultOverviewSettings, { hiddenCards: [] }, "admin")).toEqual(
      defaultOverviewSettings.cardOrder,
    );
    expect(visibleOverviewCards(defaultOverviewSettings, { hiddenCards: [] }, "viewer")).toEqual([
      "yourPlace",
      "continue",
      "onThisDay",
      "featuredAncestor",
      "familyAtAGlance",
      "topPlaces",
    ]);
    expect(
      visibleOverviewCards(defaultOverviewSettings, { hiddenCards: [] }, "editor"),
    ).not.toContain("thingsToLook");
  });

  it("drops an unknown card without losing the rest", () => {
    expect(
      parseOverviewSettings({ cardOrder: ["topPlaces", "gone", "yourPlace", "topPlaces"] })
        .cardOrder,
    ).toEqual(["topPlaces", "yourPlace"]);
    expect(parseOverviewPreferences({ hiddenCards: ["system", 3] })).toEqual({
      hiddenCards: ["system"],
    });
    expect(parseOverviewPreferences("nonsense")).toEqual({ hiddenCards: [] });
  });

  it("follows the site's order, appends new cards, and hides the site's and the member's", () => {
    const cards = visibleOverviewCards(
      { cardOrder: ["topPlaces", "yourPlace"], hiddenCards: ["system"] },
      { hiddenCards: ["onThisDay"] },
      "admin",
    );
    expect(cards.slice(0, 3)).toEqual(["topPlaces", "yourPlace", "continue"]);
    expect(cards).not.toContain("system");
    expect(cards).not.toContain("onThisDay");
  });

  it("puts the member's own order first, and the site's order after it for the rest", () => {
    const cards = visibleOverviewCards(
      { cardOrder: defaultOverviewSettings.cardOrder, hiddenCards: [] },
      { hiddenCards: [], cardOrder: ["topPlaces", "onThisDay"] },
      "viewer",
    );
    expect(cards).toEqual([
      "topPlaces",
      "onThisDay",
      "yourPlace",
      "continue",
      "featuredAncestor",
      "familyAtAGlance",
    ]);
    expect(parseOverviewPreferences({ hiddenCards: [], cardOrder: ["system", "nope"] })).toEqual({
      hiddenCards: [],
      cardOrder: ["system"],
    });
    expect(parseOverviewPreferences({ hiddenCards: [] })).toEqual({ hiddenCards: [] });
  });

  it("keeps the On this day choices, defaulting to every event and no living birthdays", () => {
    expect(defaultOverviewSettings.onThisDayEvents).toEqual(["birth", "marriage", "death"]);
    expect(defaultOverviewSettings.onThisDayLivingBirthdays).toBe(false);
    expect(
      parseOverviewSettings({ onThisDayEvents: ["death"], onThisDayLivingBirthdays: true }),
    ).toMatchObject({ onThisDayEvents: ["death"], onThisDayLivingBirthdays: true });
  });
});
