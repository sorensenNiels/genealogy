import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  /**
   * Backs the BullMQ queues (see "Long-running work: BullMQ + a shared
   * Redis" in TECH_STACK.md). Required, not optional like `IMMICH_URL`
   * below: Redis is core infrastructure here.
   */
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Comma-separated list of browser origins allowed to reach /trpc. */
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Signs better-auth's session tokens; must stay stable across restarts. */
  BETTER_AUTH_SECRET: z.string().min(1),
  /** This server's own public URL — better-auth builds OAuth callback URLs from it. */
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  /** The web app's public URL (apps/frontend) — invitation links point here. */
  APP_URL: z.string().default("http://localhost:5173"),
  // Created in Google Cloud Console; there is no default because there is no
  // safe placeholder that would let Google sign-in fail quietly.
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  /** Where uploaded photos are written; served back at /uploads. Mount this as a volume in production. */
  UPLOADS_DIR: z.string().default("./data/uploads"),
  /**
   * Where `BackupProcessor` writes a finished dump before it's downloaded.
   * Not served statically like `UPLOADS_DIR` — `BackupController` streams a
   * file from here itself and deletes it once the download completes, so
   * there's nothing to mount as a persistent volume in production.
   */
  BACKUPS_DIR: z.string().default("./data/backups"),
  /** Where a queued album/library zip download waits for its notification to be acted on — same lifecycle as `BACKUPS_DIR`. */
  ALBUM_ZIPS_DIR: z.string().default("./data/album-zips"),
  /** Where an exported static family website (a zip) waits for its notification to be acted on — same lifecycle as `BACKUPS_DIR`. */
  STATIC_SITES_DIR: z.string().default("./data/static-sites"),
  /** Disk-streamed cap for a re-uploaded backup file on the Tools page's restore flow — same reasoning as `IMMICH_MAX_UPLOAD_BYTES`, just a much larger default since a whole-database dump is bigger than a photo. */
  RESTORE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(524_288_000), // 500MB

  // Both optional and unset by default: Immich (see "Photos & albums via
  // Immich" in FEATURES.md) is optional infrastructure on its own server, so
  // the app must boot and run fine without it. Photo and album features
  // turn themselves off instead — see `ImmichService.status` — rather than
  // the app refusing to start over a missing key the way it would for,
  // say, DATABASE_URL.
  /** This app's own server-side base URL for Immich's REST API — never sent to the browser. */
  IMMICH_URL: z.string().trim().min(1).optional(),
  /**
   * Generated once by hand in Immich's own web UI (Settings > API keys);
   * this app never creates one. Must carry write scopes, not just read —
   * the full list is under "Photos & albums" in TECH_STACK.md; a read-only
   * key 403s on every upload, album edit, delete and face tag.
   */
  IMMICH_API_KEY: z.string().trim().min(1).optional(),
  /** Disk-streamed cap for photos uploaded through this app into Immich — same disk-not-memory reasoning as `BackupService`'s own `pg_dump` streaming. */
  IMMICH_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800), // 50MB

  // Optional, same reasoning as the Immich pair above: `MailService` checks
  // `isConfigured()` and falls back to logging instead of sending when
  // these are unset, so the mail queue still runs (and is testable) without
  // a real SMTP relay in dev.
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASS: z.string().trim().min(1).optional(),
  MAIL_FROM: z.string().trim().min(1).default("genealogy@example.com"),
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
