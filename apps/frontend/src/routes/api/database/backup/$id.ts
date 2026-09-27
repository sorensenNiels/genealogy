import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../../server/env";

/**
 * Raw pass-through proxy for downloading a finished backup, same reasoning
 * as photo.ts: a streamed binary (gzipped SQL dump) doesn't fit
 * `createServerFn`'s buffered-body contract, so this forwards the request
 * and response verbatim, cookie and all — apps/backend's own session check
 * still runs unmodified. This is what a "backup ready" notification's
 * `actionUrl` points at.
 */
async function proxyToBackend({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}): Promise<Response> {
  const target = `${backendUrl}/database/backup/${params.id}`;
  const response = await fetch(target, {
    method: request.method,
    headers: request.headers,
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const Route = createFileRoute("/api/database/backup/$id")({
  server: {
    handlers: {
      GET: proxyToBackend,
    },
  },
});
