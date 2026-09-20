import { z } from "zod";

import { personIdSchema } from "./person.js";

/**
 * Edge labels stored in the Apache AGE graph. Kept small on purpose: everything
 * a tree needs to be traversed lives here, while the evidence for an edge
 * (sources, citations, confidence) lives in relational tables.
 */
export const relationshipKindSchema = z.enum(["PARENT_OF", "SPOUSE_OF"]);
export type RelationshipKind = z.infer<typeof relationshipKindSchema>;

/**
 * How a parent-child link came about. Genealogically this matters: an adoptive
 * line is a real relationship but not a biological descent path, and pedigree
 * collapse calculations must be able to tell them apart.
 */
export const parentageSchema = z.enum(["birth", "adopted", "step", "foster", "unknown"]);
export type Parentage = z.infer<typeof parentageSchema>;

export const relationshipSchema = z.object({
  kind: relationshipKindSchema,
  from: personIdSchema,
  to: personIdSchema,
  parentage: parentageSchema.default("unknown"),
});
export type Relationship = z.infer<typeof relationshipSchema>;

/** A node in an ancestor or descendant walk, with its distance from the root. */
export interface PedigreeNode {
  personId: string;
  /** 0 is the person the walk started from, 1 their parents, and so on. */
  generation: number;
}
