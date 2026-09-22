import { z } from "zod";

import { historicalDateSchema, personIdSchema } from "./person.js";

/**
 * The evidence-backed detail of a spousal relationship: status and dates.
 * Deliberately relational rather than properties on the `SPOUSE_OF` graph
 * edge — this repo's stated principle is that graph edges stay thin and the
 * evidence lives in relational tables (see the `citations` comment in
 * packages/db/src/schema.ts). A pair can also have more than one union over
 * time (divorced, remarried), which a single edge property couldn't express.
 *
 * `status` is not a closed enum — the set of union statuses is
 * user-configurable (see `configurable-options.ts`, topic `"union_status"`);
 * this only checks that some key was given.
 */
export const unionStatusSchema = z.string().trim().min(1);
export type UnionStatus = z.infer<typeof unionStatusSchema>;

export const unionIdSchema = z.uuid();
export type UnionId = z.infer<typeof unionIdSchema>;

export const unionSchema = z.object({
  id: unionIdSchema,
  personAId: personIdSchema,
  personBId: personIdSchema,
  status: unionStatusSchema,
  startDate: historicalDateSchema.nullable(),
  startPlace: z.string().nullable(),
  /** Separation, divorce, or the death of a spouse — whatever ended it. */
  endDate: historicalDateSchema.nullable(),
  endPlace: z.string().nullable(),
  notes: z.string().nullable(),
});
export type Union = z.infer<typeof unionSchema>;

/** Creating a union also links the pair as spouses in the graph — see person.service.ts. */
export const createUnionSchema = z.object({
  personAId: personIdSchema,
  personBId: personIdSchema,
  status: unionStatusSchema.default("married"),
  startDate: historicalDateSchema.nullable().default(null),
  startPlace: z.string().nullable().default(null),
  endDate: historicalDateSchema.nullable().default(null),
  endPlace: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});
export type CreateUnion = z.infer<typeof createUnionSchema>;

export const updateUnionSchema = z.object({
  id: unionIdSchema,
  status: unionStatusSchema.optional(),
  startDate: historicalDateSchema.nullable().optional(),
  startPlace: z.string().nullable().optional(),
  endDate: historicalDateSchema.nullable().optional(),
  endPlace: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateUnion = z.infer<typeof updateUnionSchema>;
