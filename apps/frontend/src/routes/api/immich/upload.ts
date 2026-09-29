import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../server/env";

/**
 * Raw pass-through proxy for uploading a photo into Immich, same reasoning
 * as `routes/api/people/$id/photo.ts`: `createServerFn` buffers a request's
 * entire body into memory with no streaming, which a raw multipart upload
 * (up to `IMMICH_MAX_UPLOAD_BYTES`) shouldn't go through. Forwards the
 * request — including the multipart body and an `albumId` form field, if
 * present — verbatim; apps/backend's multer handling, size cap and session
 * check are all unchanged.
 */
async function proxyToBackend({ request }: { request: Request }): Promise<Response> {
  const target = `${backendUrl}/immich/assets`;
  const response = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: await request.arrayBuffer(),
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const Route = createFileRoute("/api/immich/upload")({
  server: {
    handlers: {
      POST: proxyToBackend,
    },
  },
});
