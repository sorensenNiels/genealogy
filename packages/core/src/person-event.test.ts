import { describe, expect, it } from "vitest";

import { createPersonEventSchema, updatePersonEventSchema } from "./person-event.js";

const personId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("createPersonEventSchema", () => {
  it('requires a label for an "other" event', () => {
    const result = createPersonEventSchema.safeParse({ personId, eventType: "other" });
    expect(result.success).toBe(false);
  });

  it('accepts an "other" event once it has a label', () => {
    const result = createPersonEventSchema.safeParse({
      personId,
      eventType: "other",
      label: "Emigrated to Canada",
    });
    expect(result.success).toBe(true);
  });

  it("doesn't require a label for a named event type", () => {
    const result = createPersonEventSchema.safeParse({ personId, eventType: "residence" });
    expect(result.success).toBe(true);
  });
});

describe("updatePersonEventSchema", () => {
  const id = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

  it('requires a label when switching an event\'s type to "other"', () => {
    const result = updatePersonEventSchema.safeParse({ id, eventType: "other" });
    expect(result.success).toBe(false);
  });

  it('allows switching to "other" once a label is included', () => {
    const result = updatePersonEventSchema.safeParse({
      id,
      eventType: "other",
      label: "Emigrated to Canada",
    });
    expect(result.success).toBe(true);
  });

  it("allows a patch that doesn't touch eventType at all", () => {
    const result = updatePersonEventSchema.safeParse({ id, place: "Copenhagen" });
    expect(result.success).toBe(true);
  });
});
