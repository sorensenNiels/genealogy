import { z } from "zod";

import { personEventIdSchema } from "./person-event.js";
import { personIdSchema } from "./person.js";
import { unionIdSchema } from "./union.js";

export const associationIdSchema = z.uuid();
export type AssociationId = z.infer<typeof associationIdSchema>;

/**
 * Not a closed enum — the set of roles is user-configurable (see
 * `configurable-options.ts`, topic `"association_role"`: godparent, witness,
 * informant, ...). `"other"` is seeded as protected and, like an "other"
 * event, needs a `label` saying what the role was.
 */
export const associationRoleSchema = z.string().trim().min(1);
export type AssociationRole = z.infer<typeof associationRoleSchema>;

/**
 * Someone named in a role on this person's record — a godparent at their
 * baptism, a witness at their marriage, the informant on their death record
 * (GEDCOM's `ASSO`). Tied to one of the person's events when the record says
 * which (`eventId`), to one of their marriages (`unionId` — a marriage
 * witness belongs to the union, not to either spouse's own events), or to
 * the person generally when it says neither.
 *
 * The associate is either someone in the tree (`associatePersonId`) or just
 * a name as written (`associateName`) — church books name far more
 * godparents than anyone will ever add as people. Exactly one of the two is
 * set (enforced by `createAssociationSchema` and a CHECK constraint).
 */
export const associationSchema = z.object({
  id: associationIdSchema,
  personId: personIdSchema,
  eventId: personEventIdSchema.nullable(),
  unionId: unionIdSchema.nullable(),
  associatePersonId: personIdSchema.nullable(),
  associateName: z.string().nullable(),
  role: associationRoleSchema,
  label: z.string().nullable(),
  /** Free-form markdown, same convention as every other notes field. */
  notes: z.string().nullable(),
});
export type Association = z.infer<typeof associationSchema>;

export const createAssociationSchema = z
  .object({
    personId: personIdSchema,
    eventId: personEventIdSchema.nullable().default(null),
    unionId: unionIdSchema.nullable().default(null),
    associatePersonId: personIdSchema.nullable().default(null),
    associateName: z.string().trim().nullable().default(null),
    role: associationRoleSchema,
    label: z.string().trim().nullable().default(null),
    notes: z.string().nullable().default(null),
  })
  .refine((data) => (data.associatePersonId !== null) !== (data.associateName?.length ?? 0) > 0, {
    message: "Give either a person from the tree or a name, not both",
    path: ["associatePersonId"],
  })
  .refine((data) => data.role !== "other" || (data.label?.length ?? 0) > 0, {
    message: 'A label is required for the "other" role',
    path: ["label"],
  })
  .refine((data) => data.eventId === null || data.unionId === null, {
    message: "An association is tied to an event or a marriage, not both",
    path: ["unionId"],
  })
  .refine((data) => data.associatePersonId !== data.personId, {
    message: "A person can't be associated with themselves",
    path: ["associatePersonId"],
  });
export type CreateAssociation = z.infer<typeof createAssociationSchema>;
