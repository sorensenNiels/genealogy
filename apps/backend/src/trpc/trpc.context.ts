import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";

import type { Auth } from "../auth/auth.module.js";

export interface TrpcContext {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  session: Awaited<ReturnType<Auth["api"]["getSession"]>>;
}

/**
 * A factory rather than a bare function: it needs the one `auth` instance
 * built by AuthModule, and that only exists once Nest has resolved it — so
 * TrpcRouter (which does have DI access) builds the bound `createContext` and
 * hands it to `createExpressMiddleware`.
 */
export function createContextFactory(auth: Auth) {
  return async function createContext({
    req,
    res,
  }: CreateExpressContextOptions): Promise<TrpcContext> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    return { req, res, session };
  };
}
