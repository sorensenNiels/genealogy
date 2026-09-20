import type { AppRouter } from "@genealogy/backend";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import { apiUrl } from "./env";

/**
 * `AppRouter` is a type-only import from the backend, so nothing server-side
 * ends up in the bundle — but a renamed procedure or a changed input shape is
 * a compile error here rather than a 400 at runtime.
 */
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${apiUrl}/trpc`,
      // Must match the transformer configured on the server.
      transformer: superjson,
      // The better-auth session cookie lives on the backend's origin; without
      // this it never rides along on cross-origin requests in dev (:5173 -> :3000).
      // `signal` is normalized because tRPC's fetchOptions type allows `undefined`
      // there, which exactOptionalPropertyTypes rejects against DOM's `| null`.
      fetch(url, options) {
        const { signal, ...rest } = options ?? {};
        return fetch(url, { ...rest, credentials: "include", signal: signal ?? null });
      },
    }),
  ],
});
