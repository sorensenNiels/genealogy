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
 *
 * Not a closed enum — the set of parentage types is user-configurable (see
 * `configurable-options.ts`, topic `"parentage"`), except for the literal
 * `"birth"`, which the Parents UI (`ParentsSection` in people.$personId.tsx)
 * depends on to slot someone into Father/Mother; that option is seeded
 * protected so it can't be deleted.
 */
export const parentageSchema = z.string().trim().min(1);
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

/**
 * A person's relationship to whichever account is currently viewing —
 * per-viewer, not tree-wide: each logged-in user has their own "this is me"
 * link (`userProfiles.personId` in `packages/db/src/schema.ts`, set from the
 * Profile page), so two accounts looking at the same person can see
 * different badges. Deliberately narrow — collateral relationships (sibling,
 * cousin, in-law) aren't classified yet, so anyone who isn't the viewer
 * themselves or on their direct ancestor/descendant line gets `null` (no
 * badge), including when the viewer hasn't identified themselves at all. Not
 * to be confused with `Parentage` above, which classifies a single edge
 * (biological/adoptive/step), not a person's overall position relative to
 * the viewer.
 */
export const relationshipToRootSchema = z.enum(["root", "ancestor", "descendant"]).nullable();
export type RelationshipToRoot = z.infer<typeof relationshipToRootSchema>;
