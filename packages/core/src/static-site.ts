import { z } from "zod";

import { personIdSchema } from "./person.js";
import { languageSchema } from "./profile.js";

/** What an admin chooses when exporting the static family website (Tools → Family website). */
export const createStaticSiteSchema = z.object({
  /** Who the tree opens on. Null → the exporting admin's own linked person, else the first A–Z. */
  startPersonId: personIdSchema.nullable().default(null),
  /** The site is written in one language. */
  language: languageSchema,
  /** Shown at the top of every page. */
  title: z.string().trim().min(1).max(120),
});
export type CreateStaticSite = z.infer<typeof createStaticSiteSchema>;
