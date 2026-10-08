import { z } from "zod";

export const sourceIdSchema = z.uuid();
export type SourceId = z.infer<typeof sourceIdSchema>;

/** A record a claim can be cited from: a parish register, a census, a headstone. */
export const sourceSchema = z.object({
  id: sourceIdSchema,
  title: z.string(),
  author: z.string().nullable(),
  publication: z.string().nullable(),
  /** The archive or library holding it — a `repositories` row. */
  repositoryId: z.uuid().nullable(),
  /** Its shelf mark in that repository (GEDCOM's REPO.CALN). */
  callNumber: z.string().nullable(),
  /** Free text, not a closed vocabulary — see the matching column comment in schema.ts. */
  sourceType: z.string().nullable(),
});
export type Source = z.infer<typeof sourceSchema>;

export const createSourceSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().nullable().default(null),
  publication: z.string().trim().nullable().default(null),
  repositoryId: z.uuid().nullable().default(null),
  callNumber: z.string().trim().nullable().default(null),
  sourceType: z.string().trim().nullable().default(null),
});
export type CreateSource = z.infer<typeof createSourceSchema>;
