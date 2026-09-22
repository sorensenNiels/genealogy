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

/** Applied to every procedure in person.router.ts, source.router.ts and settings.router.ts. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
