/**
 * Client-safe: the one thing the browser still fetches directly from
 * apps/backend rather than through this app's proxy — uploaded-photo
 * `<img>` reads (`/uploads/*`, unauthenticated static files; see the
 * migration plan's photo-upload section). Everything else goes through the
 * proxy layer server-side (see server/env.ts's `backendUrl`, which must
 * never end up in this file or the client bundle).
 */
export const publicBackendUrl: string = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
