import type { AppRouter } from "@genealogy/backend";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import { backendUrl } from "./env";

/**
 * Server-side only: every server function calls apps/backend's tRPC router
 * through this client instead of the browser calling it directly. The
 * `fetch` override forwards the incoming request's `cookie` header onto the
 * outgoing call so apps/backend's `protectedProcedure`/`auth.api.getSession()`
 * sees the same session it would if the browser had called it directly —
 * the whole point of proxying is that apps/backend's auth gating stays
 * unmodified. Read fresh on every call (not captured at module load), since
 * this one client instance is shared across concurrent requests.
 */
export const trpcProxy = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${backendUrl}/trpc`,
      transformer: superjson,
      fetch(url, options) {
        const cookie = getRequestHeader("cookie");
        const headers = new Headers(options?.headers);
        if (cookie) headers.set("cookie", cookie);
        return fetch(url, { ...options, headers, signal: options?.signal ?? null });
      },
    }),
  ],
});
