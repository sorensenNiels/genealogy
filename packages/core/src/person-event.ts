import { z } from "zod";

import { historicalDateSchema, personIdSchema } from "./person.js";

/**
 * Life events beyond birth/death, which stay as first-class `Person` fields
 * since every person has exactly one of each. Everything here can happen zero
 * to many times per person — residence and occupation especially — which is
 * why it lives in its own table instead of more columns on `persons`.
 */
export const eventTypeSchema = z.enum([
  "christening",
  "burial",
  "cremation",
  "immigration",
  "emigration",
  "naturalization",
  "residence",
  "occupation",
  "other",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const personEventIdSchema = z.uuid();
export type PersonEventId = z.infer<typeof personEventIdSchema>;

/**
 * Type-specific detail as a loose key/value bag (ship name + port for
 * immigration, employer + job title for occupation, cemetery + plot for
 * burial) rather than a rigid per-type schema — the set of useful keys varies
 * more than a fixed column list could keep up with.
 */
export const eventDetailsSchema = z.record(z.string(), z.string());
export type EventDetails = z.infer<typeof eventDetailsSchema>;

export const personEventSchema = z.object({
  id: personEventIdSchema,
  personId: personIdSchema,
  eventType: eventTypeSchema,
  /**
   * A short name for the event, distinguishing one "other" from another —
   * named types (residence, occupation, ...) already say what they are via
   * `eventType`, so this is only required when `eventType` is "other".
   */
  label: z.string().nullable(),
  date: historicalDateSchema.nullable(),
  place: z.string().nullable(),
  details: eventDetailsSchema.nullable(),
  description: z.string().nullable(),
});
export type PersonEvent = z.infer<typeof personEventSchema>;

export const createPersonEventSchema = z
  .object({
    personId: personIdSchema,
    eventType: eventTypeSchema,
    label: z.string().trim().nullable().default(null),
    date: historicalDateSchema.nullable().default(null),
    place: z.string().nullable().default(null),
    details: eventDetailsSchema.nullable().default(null),
    description: z.string().nullable().default(null),
  })
  .refine((data) => data.eventType !== "other" || (data.label?.trim().length ?? 0) > 0, {
    message: 'A label is required for "other" events',
    path: ["label"],
  });
export type CreatePersonEvent = z.infer<typeof createPersonEventSchema>;

export const updatePersonEventSchema = z
  .object({
    id: personEventIdSchema,
    eventType: eventTypeSchema.optional(),
    label: z.string().trim().nullable().optional(),
    date: historicalDateSchema.nullable().optional(),
    place: z.string().nullable().optional(),
    details: eventDetailsSchema.nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .refine(
    (data) => data.eventType !== "other" || (data.label?.trim().length ?? 0) > 0,
    // Only checked when this patch actually sets eventType to "other" — a
    // patch that leaves eventType alone can't tell here whether the row it's
    // updating already has one; the UI enforces the rest (see EventForm).
    { message: 'A label is required for "other" events', path: ["label"] },
  );
export type UpdatePersonEvent = z.infer<typeof updatePersonEventSchema>;
