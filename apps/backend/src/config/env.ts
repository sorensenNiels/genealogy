import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Comma-separated list of browser origins allowed to reach /trpc. */
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Signs better-auth's session tokens; must stay stable across restarts. */
  BETTER_AUTH_SECRET: z.string().min(1),
  /** This server's own public URL — better-auth builds OAuth callback URLs from it. */
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  // Created in Google Cloud Console; there is no default because there is no
  // safe placeholder that would let Google sign-in fail quietly.
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  /** Where uploaded photos are written; served back at /uploads. Mount this as a volume in production. */
  UPLOADS_DIR: z.string().default("./data/uploads"),

  // Both optional and unset by default: Immich (see "Photos & albums via
  // Immich" in FEATURES.md) is opt-in infrastructure (docker-compose's
  // `immich` profile), so the app must boot and run fine without it. The
  // Immich router reports itself as unconfigured — see
  // `ImmichService.isConfigured` — rather than the app refusing to start
  // over a missing key the way it would for, say, DATABASE_URL.
  /** This app's own server-side base URL for Immich's REST API — never sent to the browser. */
  IMMICH_URL: z.string().trim().min(1).optional(),
  /** Generated once by hand in Immich's own web UI (Settings > API keys); this app never creates one. */
  IMMICH_API_KEY: z.string().trim().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Fails the boot rather than letting a missing DATABASE_URL surface as a
 * connection error on the first request.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function corsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
}
