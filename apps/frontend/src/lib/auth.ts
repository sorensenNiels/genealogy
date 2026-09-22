import { createAuthClient } from "better-auth/react";

import { apiUrl } from "./env";
import { loggedFetch } from "./network-logging";

/**
 * The frontend has no auth logic of its own — this just talks to the
 * better-auth handler mounted on the backend at /api/auth, the same way
 * lib/trpc.ts only talks to /trpc.
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  fetchOptions: { customFetchImpl: loggedFetch },
});

export const { useSession } = authClient;
