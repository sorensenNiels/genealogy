import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../server/env";

/**
 * Raw pass-through proxy: every /api/auth/* request (email/password,
 * Google OAuth, session reads, sign-out) is forwarded verbatim to
 * apps/backend's better-auth handler and its response — status, headers
 * (critically Set-Cookie), body — returned unmodified. better-auth's actual
 * session logic, cookie issuance and OAuth flow all still run in Nest; this
 * exists only so the browser has a single origin (this app's) for both
 * pages and auth. `redirect: "manual"` matters specifically for the Google
 * OAuth flow: Nest responds with a redirect to Google's consent page, and
 * that must reach the browser as-is, not be followed server-side here.
 */
async function proxyToBackend({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const target = `${backendUrl}${url.pathname}${url.search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : null,
    redirect: "manual",
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: proxyToBackend,
      POST: proxyToBackend,
      PUT: proxyToBackend,
      PATCH: proxyToBackend,
      DELETE: proxyToBackend,
    },
  },
});
