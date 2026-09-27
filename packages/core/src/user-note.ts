import { z } from "zod";

/**
 * A private notebook entry for the logged-in account itself — not tied to
 * any person record, unlike `researchNoteSchema`. Ownership is enforced
 * server-side from the session, never from a client-supplied `userId`, so
 * there's deliberately no `userId` field on the create/update input shapes
 * below — only on the read-back row.
 */
export const userNoteIdSchema = z.uuid();
export type UserNoteId = z.infer<typeof userNoteIdSchema>;

export const userNoteSchema = z.object({
  id: userNoteIdSchema,
  title: z.string(),
  body: z.string(),
});
export type UserNote = z.infer<typeof userNoteSchema>;

export const createUserNoteSchema = z.object({
  title: z.string().trim().default(""),
  body: z.string().trim().min(1),
});
export type CreateUserNote = z.infer<typeof createUserNoteSchema>;

export const updateUserNoteSchema = z.object({
  id: userNoteIdSchema,
  title: z.string().trim().optional(),
  body: z.string().trim().min(1).optional(),
});
export type UpdateUserNote = z.infer<typeof updateUserNoteSchema>;
