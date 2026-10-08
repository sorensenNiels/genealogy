import { z } from "zod";

/**
 * Where an external id comes from. Structural rather than configurable: the
 * GEDCOM exporter writes each one as a different tag (`_FSFTID`, `_APID`,
 * `REFN`, `EXID`), and the person page links FamilySearch ids to their
 * profile. Mirrored by a CHECK constraint on `person_external_ids.system`.
 */
export const personExternalIdSystemSchema = z.enum(["familysearch", "ancestry", "refn", "exid"]);
export type PersonExternalIdSystem = z.infer<typeof personExternalIdSystemSchema>;

export const personExternalIdIdSchema = z.uuid();

export const createPersonExternalIdSchema = z.object({
  personId: z.uuid(),
  system: personExternalIdSystemSchema,
  value: z.string().trim().min(1).max(200),
  /** REFN's TYPE ("Ancestral File"), or EXID's TYPE URI. */
  type: z.string().trim().max(500).nullable().default(null),
});
export type CreatePersonExternalId = z.infer<typeof createPersonExternalIdSchema>;

export interface PersonExternalId {
  id: string;
  personId: string;
  system: PersonExternalIdSystem;
  value: string;
  type: string | null;
}

/**
 * A web address for the id when the system has a public one — only
 * FamilySearch's tree ids (`LZ4Y-9K2`-style, the shape this app's own public
 * id copies) have a stable, documented profile URL.
 */
export function externalIdUrl(id: {
  system: PersonExternalIdSystem;
  value: string;
}): string | null {
  if (id.system === "familysearch" && /^[A-Z0-9]{4}-[A-Z0-9]{3}$/i.test(id.value)) {
    return `https://www.familysearch.org/tree/person/details/${id.value.toUpperCase()}`;
  }
  return null;
}
