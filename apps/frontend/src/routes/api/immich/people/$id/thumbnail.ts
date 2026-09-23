import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../../../server/env";

/**
 * Raw pass-through proxy for an Immich person's face thumbnail — same shape
 * as `/api/people/$id/photo`, but a GET rather than upload/delete: unlike
 * `/uploads/*`, an Immich read needs the API key attached server-side on
 * every request (see "Photos & albums via Immich" in FEATURES.md), so there
 * is no direct-to-backend `<img src>` exception here the way there is for a
 * person's own uploaded photo.
 */
async function proxyToBackend({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}): Promise<Response> {
  const target = `${backendUrl}/immich/people/${params.id}/thumbnail`;
  const response = await fetch(target, { headers: request.headers });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const Route = createFileRoute("/api/immich/people/$id/thumbnail")({
  server: {
    handlers: {
      GET: proxyToBackend,
    },
  },
});
