import { describe, expect, it } from "vitest";

import { canEdit, isAdmin, isRedactedFor } from "./membership.js";

describe("roles", () => {
  it("lets editors and admins edit, and only admins administer", () => {
    expect([canEdit("admin"), canEdit("editor"), canEdit("viewer")]).toEqual([true, true, false]);
    expect([isAdmin("admin"), isAdmin("editor"), isAdmin("viewer")]).toEqual([true, false, false]);
  });

  it("treats a missing role as the least access", () => {
    expect(canEdit(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("isRedactedFor", () => {
  const living = { isLiving: true, restriction: null };
  const deceased = { isLiving: false, restriction: null };

  it("redacts living people for a viewer", () => {
    expect(isRedactedFor("viewer", living)).toBe(true);
    expect(isRedactedFor("viewer", deceased)).toBe(false);
  });

  it("redacts the deceased too when marked private or confidential, but not locked", () => {
    expect(isRedactedFor("viewer", { isLiving: false, restriction: "privacy" })).toBe(true);
    expect(isRedactedFor("viewer", { isLiving: false, restriction: "confidential" })).toBe(true);
    expect(isRedactedFor("viewer", { isLiving: false, restriction: "locked" })).toBe(false);
  });

  it("never redacts for editors and admins, who maintain the data", () => {
    expect(isRedactedFor("editor", living)).toBe(false);
    expect(isRedactedFor("admin", { isLiving: true, restriction: "confidential" })).toBe(false);
  });
});
