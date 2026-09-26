import { z } from "zod";

import { personIdSchema } from "./person.js";

export const researchNoteIdSchema = z.uuid();
export type ResearchNoteId = z.infer<typeof researchNoteIdSchema>;

/**
 * Not a closed enum — the set of note kinds is user-configurable (see
 * `configurable-options.ts`, topic `"research_note_type"`), typically "Open
 * question" or "Note". Whether a note is currently open has nothing to do
 * with this — see `resolved` on `researchNoteSchema`.
 */
export const researchNoteTypeSchema = z.string().trim().min(1);
export type ResearchNoteType = z.infer<typeof researchNoteTypeSchema>;

export const researchNoteSchema = z.object({
  id: researchNoteIdSchema,
  personId: personIdSchema,
  noteType: researchNoteTypeSchema,
  body: z.string(),
  resolved: z.boolean(),
});
export type ResearchNote = z.infer<typeof researchNoteSchema>;

export const createResearchNoteSchema = z.object({
  personId: personIdSchema,
  noteType: researchNoteTypeSchema.default("note"),
  body: z.string().trim().min(1),
});
export type CreateResearchNote = z.infer<typeof createResearchNoteSchema>;

export const updateResearchNoteSchema = z.object({
  id: researchNoteIdSchema,
  noteType: researchNoteTypeSchema.optional(),
  body: z.string().trim().min(1).optional(),
  resolved: z.boolean().optional(),
});
export type UpdateResearchNote = z.infer<typeof updateResearchNoteSchema>;
