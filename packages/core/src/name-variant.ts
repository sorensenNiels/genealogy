import { z } from "zod";

import { historicalDateSchema, personIdSchema, personNameSchema } from "./person.js";

/**
 * A name a person was also known by. Kept as its own record rather than an
 * array on `Person` because each variant carries its own note (when/why it
 * was used) and, unlike the primary name, there can be any number of them.
 *
 * "birth" rather than "maiden": either spouse can take the other's surname at
 * marriage (common for men as well as women in Denmark), so the type that
 * names what a person was called before that has to fit both.
 *
 * "nickname" and "preferred_name" absorb what used to be a single combined
 * `nickname` array on `Person` — kept as two distinct types rather than one,
 * since an informal nickname ("Bud") and the name someone actually wants
 * used ("Robert" over "Bob") aren't the same thing and a source may only
 * evidence one of them. Both get the same evidence fields (`since`, `notes`)
 * as every other alternate name instead of living as bare, uncited strings
 * on the primary record.
 *
 * Not a closed enum — the set of name-variant types is user-configurable
 * (see `configurable-options.ts`, topic `"name_variant_type"`); this only
 * checks that some key was given.
 */
export const nameVariantTypeSchema = z.string().trim().min(1);
export type NameVariantType = z.infer<typeof nameVariantTypeSchema>;

export const nameVariantIdSchema = z.uuid();
export type NameVariantId = z.infer<typeof nameVariantIdSchema>;

export const nameVariantSchema = personNameSchema.extend({
  id: nameVariantIdSchema,
  personId: personIdSchema,
  nameType: nameVariantTypeSchema,
  /** When this name started being used, e.g. a marriage date — lets a person's names sort chronologically instead of relying on `notes` prose. */
  since: historicalDateSchema.nullable(),
  /** Context for why/when this name was used, e.g. "used after 1880 census". */
  notes: z.string().nullable(),
});
export type NameVariant = z.infer<typeof nameVariantSchema>;

export const createNameVariantSchema = z.object({
  personId: personIdSchema,
  nameType: nameVariantTypeSchema,
  given: z.string().trim().default(""),
  surname: z.string().trim().default(""),
  since: historicalDateSchema.nullable().default(null),
  notes: z.string().nullable().default(null),
});
export type CreateNameVariant = z.infer<typeof createNameVariantSchema>;

/** Input accepted when editing an alternate name; every field but `id` is optional. */
export const updateNameVariantSchema = z.object({
  id: nameVariantIdSchema,
  nameType: nameVariantTypeSchema.optional(),
  given: z.string().trim().optional(),
  surname: z.string().trim().optional(),
  since: historicalDateSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateNameVariant = z.infer<typeof updateNameVariantSchema>;
