import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../../server/env";

/**
 * Raw pass-through proxy for downloading a finished album/library zip, same
 * reasoning as `api/database/backup/$id.ts`: a streamed binary doesn't fit
 * `createServerFn`'s buffered-body contract, so this forwards the request
 * and response verbatim, cookie and all — apps/backend's own session check
 * still runs unmodified. This is what an "album_zip_ready" notification's
 * `actionUrl` points at.
 */
async function proxyToBackend({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}): Promise<Response> {
  const target = `${backendUrl}/immich/album-zips/${params.id}`;
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

export const Route = createFileRoute("/api/immich/album-zips/$id")({
  server: {
    handlers: {
      GET: proxyToBackend,
    },
  },
});
