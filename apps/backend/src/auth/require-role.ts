import { canEdit, isAdmin, memberRoleSchema, type MemberRole } from "@genealogy/core";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";

import type { Auth } from "./auth.module.js";

export type RequiredRole = "member" | "editor" | "admin";

/**
 * The REST controllers' version of `protectedProcedure`/`editorProcedure`/
 * `adminProcedure` — they sit outside tRPC's context, so they check the
 * session (and now the role) by hand. Returns the session for callers that
 * need the user.
 */
export async function requireRole(auth: Auth, req: Request, required: RequiredRole) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new UnauthorizedException();
  const parsed = memberRoleSchema.safeParse(session.user.role);
  const role: MemberRole = parsed.success ? parsed.data : "viewer";
  if (required === "editor" && !canEdit(role)) {
    throw new ForbiddenException("Only editors can change the family tree");
  }
  if (required === "admin" && !isAdmin(role)) {
    throw new ForbiddenException("Only admins can do that");
  }
  return session;
}
