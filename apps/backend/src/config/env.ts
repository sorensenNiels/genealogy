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
