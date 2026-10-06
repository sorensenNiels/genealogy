import { describe, expect, it } from "vitest";

import { createAssociationSchema } from "./association.js";

const personId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const otherId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const eventId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

describe("createAssociationSchema", () => {
  it("accepts a person from the tree, or a name, but not both or neither", () => {
    expect(
      createAssociationSchema.safeParse({ personId, associatePersonId: otherId, role: "witness" })
        .success,
    ).toBe(true);
    expect(
      createAssociationSchema.safeParse({ personId, associateName: "Ane", role: "witness" })
        .success,
    ).toBe(true);
    expect(
      createAssociationSchema.safeParse({
        personId,
        associatePersonId: otherId,
        associateName: "Ane",
        role: "witness",
      }).success,
    ).toBe(false);
    expect(
      createAssociationSchema.safeParse({ personId, associateName: "  ", role: "witness" }).success,
    ).toBe(false);
  });

  it('requires a label for the "other" role', () => {
    expect(
      createAssociationSchema.safeParse({ personId, associateName: "Ane", role: "other" }).success,
    ).toBe(false);
    expect(
      createAssociationSchema.safeParse({
        personId,
        associateName: "Ane",
        role: "other",
        label: "Neighbour",
      }).success,
    ).toBe(true);
  });

  it("refuses an event and a marriage at once, and self-association", () => {
    expect(
      createAssociationSchema.safeParse({
        personId,
        associateName: "Ane",
        role: "witness",
        eventId,
        unionId: eventId,
      }).success,
    ).toBe(false);
    expect(
      createAssociationSchema.safeParse({ personId, associatePersonId: personId, role: "witness" })
        .success,
    ).toBe(false);
  });
});
