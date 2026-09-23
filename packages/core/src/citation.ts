import { z } from "zod";

import { personIdSchema } from "./person.js";
import { sourceIdSchema } from "./source.js";

/**
 * Not a closed enum — the set of confidence levels is user-configurable (see
 * `configurable-options.ts`, topic `"confidence"`); this only checks that
 * some key was given.
 */
export const confidenceSchema = z.string().trim().min(1);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * What a citation is evidence for: the person as a whole, or a row in
 * `personNames`/`personEvents`/`unions` — see `factId` below. Birth and death
 * used to be their own fact types here (they lived directly on `persons`);
 * now that they're ordinary `personEvents` rows (see "Birth and death are
 * events" in TECH_STACK.md), citing one is just `factType: "event"` with
 * that row's id, like any other event.
 */
export const citationFactTypeSchema = z.enum(["person", "name", "event", "union"]);
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
   * `factType`; null for "person", which has no row of its own. Not typed
   * against a specific id schema here since which one applies depends on
   * `factType` — see the `factId` comment in schema.ts.
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
