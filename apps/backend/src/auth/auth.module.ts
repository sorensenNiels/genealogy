import type { Database } from "@genealogy/db";
import { schema } from "@genealogy/db";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { corsOrigins } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";

export const AUTH = "AUTH";

/**
 * A named function rather than an inline factory: `betterAuth`'s return type
 * is generic over its config, and the bare `Auth` type exported by the
 * package (parameterised over the *default* config) isn't assignable from a
 * concrete config's `Auth<...>` — so every other file that needs the type
 * imports `Auth` from here (via `ReturnType<typeof createAuth>`) instead of
 * from "better-auth" directly.
 */
function createAuth(config: ConfigService, db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: {
        clientId: config.getOrThrow("GOOGLE_CLIENT_ID"),
        clientSecret: config.getOrThrow("GOOGLE_CLIENT_SECRET"),
      },
    },
    secret: config.getOrThrow("BETTER_AUTH_SECRET"),
    baseURL: config.getOrThrow("BETTER_AUTH_URL"),
    trustedOrigins: corsOrigins(config.getOrThrow("CORS_ORIGINS")),
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Global for the same reason as DatabaseModule: TrpcRouter (session lookup)
 * and main.ts (mounting the HTTP handler) both need the one instance.
 */
@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [ConfigService, DRIZZLE],
      useFactory: createAuth,
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
