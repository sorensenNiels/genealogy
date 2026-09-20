/**
 * The public surface of this app as a package: apps/frontend imports `AppRouter` to
 * type its tRPC client, and nothing else. Keep this file type-only so the web
 * bundle can never pull server code in by accident.
 */
export type { AppRouter } from "./trpc/trpc.router.js";
