import { canEdit, isAdmin, memberRoleSchema, type MemberRole } from "@genealogy/core";
import { useRouteContext } from "@tanstack/react-router";

/**
 * The signed-in member's role, resolved once per navigation by `__root.tsx`'s
 * `beforeLoad` (so it's right on the first server-rendered byte — no flash of
 * edit buttons for a Viewer). What it allows is decided by the backend; this
 * only decides what the UI offers.
 */
export function usePermissions(): { role: MemberRole; canEdit: boolean; isAdmin: boolean } {
  const { role } = useRouteContext({ from: "__root__" });
  return { role, canEdit: canEdit(role), isAdmin: isAdmin(role) };
}

/** Reads a session's role defensively — anything unexpected is the least access. */
export function roleOf(session: { user: { role?: unknown } } | null): MemberRole {
  const parsed = memberRoleSchema.safeParse(session?.user.role);
  return parsed.success ? parsed.data : "viewer";
}
