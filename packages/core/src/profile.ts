import { z } from "zod";

import { personIdSchema } from "./person.js";

/** The app's supported UI languages — see "Internationalization" in FEATURES.md. */
export const languageSchema = z.enum(["en", "da"]);
export type Language = z.infer<typeof languageSchema>;

/**
 * What a logged-in account can edit about itself beyond its better-auth
 * identity (name/email/password — all handled by better-auth's own client,
 * see `authClient.updateUser`/`authClient.changePassword`, not this schema).
 * All fields optional so a caller can patch just one, same convention as
 * `updatePersonSchema` — `personId: null` clears the "this is you" link
 * without touching the other fields, and so on.
 */
export const updateProfileSchema = z.object({
  phoneNumber: z.string().trim().nullable().optional(),
  personId: personIdSchema.nullable().optional(),
  language: languageSchema.nullable().optional(),
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
