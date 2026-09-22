import { Inject, Injectable, Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { AUTH, type Auth } from "../auth/auth.module.js";
import { PersonRouter } from "../person/person.router.js";
import { SettingsRouter } from "../settings/settings.router.js";
import { SourceRouter } from "../source/source.router.js";
import { publicProcedure, router } from "./trpc.base.js";
import { createContextFactory } from "./trpc.context.js";

@Injectable()
export class TrpcRouter {
  private readonly logger = new Logger(TrpcRouter.name);

  constructor(
    private readonly person: PersonRouter,
    private readonly source: SourceRouter,
    private readonly settings: SettingsRouter,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  build() {
    return router({
      health: publicProcedure.query(() => ({
        status: "ok" as const,
        checkedAt: new Date(),
      })),
      person: this.person.build(),
      source: this.source.build(),
      settings: this.settings.build(),
    });
  }

  /** Mounts tRPC on the underlying Express instance at /trpc. */
  applyMiddleware(app: INestApplication): void {
    app.use(
      "/trpc",
      createExpressMiddleware({
        router: this.build(),
        createContext: createContextFactory(this.auth),
        onError: ({ path, type, error, ctx }) => {
          // `type` (query/mutation) and whether a session was on the context
          // are the two things needed to tell "this call was never
          // authenticated" apart from "the session check itself failed" —
          // both surface as the same UNAUTHORIZED message otherwise.
          const hasSession = ctx?.session != null;
          this.logger.error(
            `tRPC ${type} ${path ?? "<no path>"}: ${error.message} (session: ${hasSession})`,
            error.stack,
          );
        },
      }),
    );
  }
}

/**
 * The contract apps/frontend consumes. Inferred, never hand-written — that is the
 * whole point of tRPC, and it is why the web app depends on this package for
 * types only.
 */
export type AppRouter = ReturnType<TrpcRouter["build"]>;
