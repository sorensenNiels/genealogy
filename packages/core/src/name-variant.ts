import { z } from "zod";

import { personIdSchema, personNameSchema } from "./person.js";

/**
 * A name a person was also known by. Kept as its own record rather than an
 * array on `Person` because each variant carries its own note (when/why it
 * was used) and, unlike the primary name, there can be any number of them.
 */
export const nameVariantTypeSchema = z.enum(["maiden", "married", "alternate_spelling", "other"]);
export type NameVariantType = z.infer<typeof nameVariantTypeSchema>;

export const nameVariantIdSchema = z.uuid();
export type NameVariantId = z.infer<typeof nameVariantIdSchema>;

export const nameVariantSchema = personNameSchema.extend({
  id: nameVariantIdSchema,
  personId: personIdSchema,
  nameType: nameVariantTypeSchema,
  /** Context for why/when this name was used, e.g. "used after 1880 census". */
  notes: z.string().nullable(),
});
export type NameVariant = z.infer<typeof nameVariantSchema>;

export const createNameVariantSchema = z.object({
  personId: personIdSchema,
  nameType: nameVariantTypeSchema,
  given: z.string().trim().default(""),
  surname: z.string().trim().default(""),
  notes: z.string().nullable().default(null),
});
export type CreateNameVariant = z.infer<typeof createNameVariantSchema>;

/** Input accepted when editing an alternate name; every field but `id` is optional. */
export const updateNameVariantSchema = z.object({
  id: nameVariantIdSchema,
  nameType: nameVariantTypeSchema.optional(),
  given: z.string().trim().optional(),
  surname: z.string().trim().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateNameVariant = z.infer<typeof updateNameVariantSchema>;
