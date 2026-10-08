import { canEdit, isAdmin, memberRoleSchema, type MemberRole } from "@genealogy/core";
import { initTRPC, TRPCError } from "@trpc/server";
// Unused directly, but req/res on TrpcContext are Express types whose generics
// resolve to these — without them in scope, tsc can't emit a portable
// declaration for protectedProcedure's inferred type below (TS2883).
import type { ParamsDictionary as _ParamsDictionary } from "express-serve-static-core";
import type { ParsedQs as _ParsedQs } from "qs";
import superjson from "superjson";
import { ZodError, z } from "zod";

import type { TrpcContext } from "./trpc.context.js";

/**
 * Built at module scope rather than inside a Nest provider: the tRPC builder is
 * a type factory, and every router in the app must be produced by the *same*
 * instance for the inferred `AppRouter` type to line up.
 */
const t = initTRPC.context<TrpcContext>().create({
  // Genealogical payloads carry Dates and Maps that JSON flattens into strings.
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        validation: error.cause instanceof ZodError ? z.treeifyError(error.cause) : null,
      },
    };
  },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;

export const publicProcedure = t.procedure;

/**
 * Any signed-in member. Reads go through this; a Viewer's reads of living
 * people come back redacted (see `PersonRedactor`), so `ctx.role` is passed
 * along for that.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // The column is CHECK-constrained, so this only falls back for a session
  // minted before the role column existed — and then to the least access.
  const parsed = memberRoleSchema.safeParse(ctx.session.user.role);
  const role: MemberRole = parsed.success ? parsed.data : "viewer";
  return next({ ctx: { ...ctx, session: ctx.session, role } });
});

/** Editors and admins: every change to the tree and photos. */
export const editorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!canEdit(ctx.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only editors can change the family tree" });
  }
  return next();
});

/** Admins only: members, Settings, Tools, merging and deleting. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can do that" });
  }
  return next();
});
