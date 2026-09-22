import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../../server/env";

/**
 * Raw pass-through proxy for photo upload/delete, replacing PersonPhoto's
 * former direct cross-origin fetch to apps/backend (see the comment that
 * used to sit above `PersonPhoto` in people/$personId.tsx). Forwards the
 * request — including the multipart body — verbatim; apps/backend's multer
 * handling, 5MB cap and session check are all unchanged. Note the path
 * rewrite: apps/backend's controller is mounted at plain `/people`, not
 * `/api/people` — only this app's own proxy route lives under `/api`.
 */
async function proxyToBackend({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}): Promise<Response> {
  const target = `${backendUrl}/people/${params.id}/photo`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : null,
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const Route = createFileRoute("/api/people/$id/photo")({
  server: {
    handlers: {
      POST: proxyToBackend,
      DELETE: proxyToBackend,
    },
  },
});
