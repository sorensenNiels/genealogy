import { createAuthClient } from "better-auth/react";

import { loggedFetch } from "./network-logging";

/**
 * No baseURL: /api/auth/* is proxied by this app itself (see
 * routes/api/auth/$.ts) to apps/backend, so this is always a same-origin
 * call — unlike apps/frontend's version, which had to point cross-origin at
 * the backend directly.
 */
export const authClient = createAuthClient({
  fetchOptions: { customFetchImpl: loggedFetch },
});

export const { useSession } = authClient;
