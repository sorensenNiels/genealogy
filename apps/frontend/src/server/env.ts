/**
 * Server-only: where this app's proxy layer reaches apps/backend. Kept out
 * of lib/env.ts (which client code also imports) so nothing in this file
 * ever ends up evaluated in the browser bundle, where `process` doesn't exist.
 */
export const backendUrl: string = process.env.BACKEND_URL ?? "http://localhost:3000";
