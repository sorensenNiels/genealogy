import { describe, expect, it } from "vitest";

import { defaultTreeSettings, parseTreeSettings, treeSettingsSchema } from "./app-settings.js";

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
