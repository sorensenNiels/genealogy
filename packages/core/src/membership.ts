import { z } from "zod";

import type { PersonRestriction } from "./person.js";

/**
 * What a signed-in member may do. Structural, not configurable: every
 * procedure is gated on these exact values (see `editorProcedure`/
 * `adminProcedure` in the backend). Stored on better-auth's `user.role`.
 *
 * - admin: everything, including members and invitations, Settings, Tools
 *   (backup/restore, GEDCOM, integrity), merging and deleting.
 * - editor: edits the tree and photos.
 * - viewer: reads only — and sees living people redacted (`isRedactedFor`).
 */
export const memberRoleSchema = z.enum(["admin", "editor", "viewer"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export function canEdit(role: MemberRole | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

export function isAdmin(role: MemberRole | null | undefined): boolean {
  return role === "admin";
}

/**
 * Whether `role` sees this person as "name only": a Viewer looking at someone
 * living, or at someone marked private or confidential (`persons.restriction`,
 * GEDCOM's RESN). Editors and admins always see everything — they maintain
 * the data. "locked" doesn't redact; it's about editing, not reading.
 */
export function isRedactedFor(
  role: MemberRole | null | undefined,
  person: { isLiving: boolean; restriction: PersonRestriction | string | null },
): boolean {
  if (canEdit(role)) return false;
  return (
    person.isLiving || person.restriction === "privacy" || person.restriction === "confidential"
  );
}

/** How long an invitation link works. Long enough for a relative to get round to it. */
export const INVITATION_LIFETIME_DAYS = 14;

export const invitationIdSchema = z.uuid();

export const createInvitationSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: memberRoleSchema,
  /** Pre-links "this is you" to their person in the tree on acceptance. */
  personId: z.uuid().nullable().default(null),
  message: z.string().trim().max(1000).nullable().default(null),
});
export type CreateInvitation = z.infer<typeof createInvitationSchema>;

/** The secret in an invitation link — only its SHA-256 hash is stored. */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);

export const updateMemberRoleSchema = z.object({
  userId: z.string().min(1),
  role: memberRoleSchema,
});
