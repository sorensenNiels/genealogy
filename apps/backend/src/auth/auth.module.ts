import { createHash } from "node:crypto";

import { invitations, schema, userProfiles, user as userTable, type Database } from "@genealogy/db";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";

import { corsOrigins } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";

export const AUTH = "AUTH";

/** An invitation link's secret, as stored: only the SHA-256 hash ever reaches the database. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The newest invitation for `email` that's still usable — not accepted, revoked or expired. */
async function pendingInvitation(db: Database, email: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email.trim().toLowerCase()),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitations.createdAt))
    .limit(1);
  return row;
}

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
    user: {
      additionalFields: {
        // `input: false`: never settable by the client — the create hook
        // below decides it, and only an admin changes it afterwards.
        role: { type: "string", required: false, defaultValue: "viewer", input: false },
      },
    },
    /**
     * Sign-up is invite-only, enforced here — the one place every new account
     * passes through, whether by email/password or Google. A new account
     * needs a pending invitation for its email; email/password sign-up must
     * also carry the invitation link's token (`inviteToken`), because unlike
     * Google it proves nothing about owning the address. The very first
     * account on an empty database is let through as admin, so a fresh
     * install can be set up at all.
     */
    databaseHooks: {
      user: {
        create: {
          before: async (newUser, context) => {
            const [existing] = await db.select({ value: count() }).from(userTable);
            if ((existing?.value ?? 0) === 0) return { data: { ...newUser, role: "admin" } };

            const invitation = await pendingInvitation(db, newUser.email);
            if (!invitation) {
              throw new APIError("FORBIDDEN", {
                message: "This family tree is invite-only — ask an admin for an invitation",
              });
            }
            if (context?.path === "/sign-up/email") {
              const body = context.body as { inviteToken?: unknown } | undefined;
              const token = typeof body?.inviteToken === "string" ? body.inviteToken : "";
              if (hashInvitationToken(token) !== invitation.tokenHash) {
                throw new APIError("FORBIDDEN", {
                  message: "That invitation link doesn't match this email address",
                });
              }
            }
            return { data: { ...newUser, role: invitation.role } };
          },
          after: async (created) => {
            const invitation = await pendingInvitation(db, created.email);
            if (!invitation) return;
            await db
              .update(invitations)
              .set({ acceptedAt: new Date(), acceptedBy: created.id })
              .where(eq(invitations.id, invitation.id));
            // "This is you", if the admin picked their person — skipped
            // silently if someone else has claimed that person meanwhile.
            if (invitation.personId) {
              await db
                .insert(userProfiles)
                .values({ userId: created.id, personId: invitation.personId })
                .onConflictDoNothing();
            }
          },
        },
      },
    },
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
