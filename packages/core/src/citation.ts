import { z } from "zod";

import { personIdSchema } from "./person.js";
import { sourceIdSchema } from "./source.js";

export const confidenceSchema = z.enum(["low", "medium", "high", "proven"]);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * What a citation is evidence for: the person as a whole, one of the two
 * fields that live directly on `persons` (birth/death), or a row in
 * `personNames`/`personEvents`/`unions` — see `factId` below.
 */
export const citationFactTypeSchema = z.enum([
  "person",
  "birth",
  "death",
  "name",
  "event",
  "union",
]);
export type CitationFactType = z.infer<typeof citationFactTypeSchema>;

const FACT_TYPES_NEEDING_ID = new Set<CitationFactType>(["name", "event", "union"]);

export const citationIdSchema = z.uuid();
export type CitationId = z.infer<typeof citationIdSchema>;

export const citationSchema = z.object({
  id: citationIdSchema,
  sourceId: sourceIdSchema,
  personId: personIdSchema,
  factType: citationFactTypeSchema,
  /**
   * The `personNames`/`personEvents`/`unions` row this cites, matching
   * `factType`; null for "person"/"birth"/"death", which have no row of
   * their own. Not typed against a specific id schema here since which one
   * applies depends on `factType` — see the `factId` comment in schema.ts.
   */
  factId: z.uuid().nullable(),
  page: z.string().nullable(),
  volume: z.string().nullable(),
  entryId: z.string().nullable(),
  certificateNumber: z.string().nullable(),
  confidence: confidenceSchema,
  note: z.string().nullable(),
});
export type Citation = z.infer<typeof citationSchema>;

const factIdMatchesFactType = (data: { factType: CitationFactType; factId: string | null }) =>
  FACT_TYPES_NEEDING_ID.has(data.factType) === (data.factId !== null);

export const createCitationSchema = z
  .object({
    sourceId: sourceIdSchema,
    personId: personIdSchema,
    factType: citationFactTypeSchema.default("person"),
    factId: z.uuid().nullable().default(null),
    page: z.string().trim().nullable().default(null),
    volume: z.string().trim().nullable().default(null),
    entryId: z.string().trim().nullable().default(null),
    certificateNumber: z.string().trim().nullable().default(null),
    confidence: confidenceSchema.default("medium"),
    note: z.string().trim().nullable().default(null),
  })
  .refine(factIdMatchesFactType, {
    message:
      'factId is required for "name"/"event"/"union" citations, and must be absent otherwise',
    path: ["factId"],
  });
export type CreateCitation = z.infer<typeof createCitationSchema>;
