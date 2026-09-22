import { z } from "zod";

/**
 * Which dropdown a configurable option belongs to. The set of topics itself
 * is fixed code, not user-configurable — each one is wired to a specific
 * column (or, for `parentage`, a graph edge property) and, in a couple of
 * cases, real validation logic. Only the *options within* a topic are
 * editable at runtime; see `packages/db/src/schema.ts`'s `configurableOptions`
 * table.
 */
export const configurableTopicSchema = z.enum([
  "event_type",
  "name_variant_type",
  "confidence",
  "union_status",
  "parentage",
]);
export type ConfigurableTopic = z.infer<typeof configurableTopicSchema>;

export const TOPIC_LABELS: Record<ConfigurableTopic, string> = {
  event_type: "Life event types",
  name_variant_type: "Alternate name types",
  confidence: "Citation confidence levels",
  union_status: "Spouse union statuses",
  parentage: "Parent relationship types",
};

export const configurableOptionIdSchema = z.uuid();
export type ConfigurableOptionId = z.infer<typeof configurableOptionIdSchema>;

export const configurableOptionSchema = z.object({
  id: configurableOptionIdSchema,
  topic: configurableTopicSchema,
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  isProtected: z.boolean(),
});
export type ConfigurableOption = z.infer<typeof configurableOptionSchema>;

/**
 * `key` doubles as the value stored on every row that references it (an
 * event's `eventType`, a citation's `confidence`, ...), so it's restricted to
 * what a plain identifier can hold and — unlike `label` — never changes after
 * creation. Renaming it would silently orphan existing data; add a new option
 * and retire the old one instead.
 */
const configurableOptionKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "lowercase letters, numbers and underscores, starting with a letter");

export const addConfigurableOptionSchema = z.object({
  topic: configurableTopicSchema,
  key: configurableOptionKeySchema,
  label: z.string().trim().min(1),
});
export type AddConfigurableOption = z.infer<typeof addConfigurableOptionSchema>;

export const updateConfigurableOptionSchema = z.object({
  id: configurableOptionIdSchema,
  label: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateConfigurableOption = z.infer<typeof updateConfigurableOptionSchema>;

export const moveConfigurableOptionSchema = z.object({
  id: configurableOptionIdSchema,
  direction: z.enum(["up", "down"]),
});
export type MoveConfigurableOption = z.infer<typeof moveConfigurableOptionSchema>;
