import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { backendUrl } from "../env";

/** Only the fields this app actually reads (see __root.tsx's SessionStatus). */
export interface Session {
  user: { name: string; email: string };
}

/**
 * Used from `beforeLoad`, which also runs during SSR — the browser-side
 * `authClient.getSession()` can't be used there since a relative fetch has
 * no `document.location` to resolve against on the server. This calls
 * apps/backend's better-auth REST endpoint directly (the same one
 * `authClient.getSession()` calls client-side), forwarding the incoming
 * request's cookie exactly like `trpc-proxy-client.ts` does for data calls.
 */
export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<Session | null> => {
    const cookie = getRequestHeader("cookie");
    const headers = new Headers();
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(`${backendUrl}/api/auth/get-session`, { headers });
    if (!response.ok) return null;
    return (await response.json()) as Session | null;
  },
);
