import type { AppRouter } from "@genealogy/backend";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";

import { backendUrl } from "./env";
import { errorTranslationLink } from "./trpc-error-translation-link";

/**
 * Server-side only: every server function calls apps/backend's tRPC router
 * through this client instead of the browser calling it directly. The
 * `fetch` override forwards the incoming request's `cookie` header onto the
 * outgoing call so apps/backend's `protectedProcedure`/`auth.api.getSession()`
 * sees the same session it would if the browser had called it directly —
 * the whole point of proxying is that apps/backend's auth gating stays
 * unmodified. Read fresh on every call (not captured at module load), since
 * this one client instance is shared across concurrent requests.
 *
 * Deliberately `httpLink`, not `httpBatchLink`: batching queues concurrent
 * calls behind one shared `setTimeout` and fires a single outgoing `fetch`
 * for the whole queue, using whichever request happened to be in scope
 * when that timer fired for `getRequestHeader("cookie")` — every other
 * request sharing that batch gets its own procedure call sent under a
 * DIFFERENT signed-in user's cookie. Confirmed directly: two concurrent
 * calls through a batched client resolved with only one cookie value ever
 * reaching the `fetch` override, silently applied to both. `refresh()` in
 * routes/people/$personId.tsx fires ~10 query invalidations at once on
 * every save, which is exactly the concurrency this would hit on every
 * edit. `httpLink` calls `fetch` immediately and synchronously per
 * operation, so each request's `getRequestHeader()` call always runs
 * inside that same request's own async context — the one HTTP round trip
 * this gives up was never a real saving against a request that also has to
 * cross the network to apps/backend.
 */
export const trpcProxy = createTRPCClient<AppRouter>({
  links: [
    // Ahead of httpLink so it sees every error on the way back up before a
    // server function's own `.query()/.mutate()` call does — see that
    // file's own doc comment.
    errorTranslationLink(),
    httpLink({
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
