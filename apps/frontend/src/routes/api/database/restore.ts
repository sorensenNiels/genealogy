import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../server/env";

/**
 * Raw pass-through proxy for uploading a backup file to restore from, same
 * reasoning as `routes/api/immich/upload.ts`: `createServerFn` buffers a
 * request's entire body into memory with no streaming, which a
 * `RESTORE_MAX_UPLOAD_BYTES`-sized multipart upload shouldn't go through.
 * Forwards the request verbatim; apps/backend's multer handling, size cap
 * and session check are all unchanged.
 */
async function proxyToBackend({ request }: { request: Request }): Promise<Response> {
  const target = `${backendUrl}/database/restore`;
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

export const Route = createFileRoute("/api/database/restore")({
  server: {
    handlers: {
      POST: proxyToBackend,
    },
  },
});
