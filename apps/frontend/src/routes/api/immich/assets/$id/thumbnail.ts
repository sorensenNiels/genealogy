import { createFileRoute } from "@tanstack/react-router";

import { backendUrl } from "../../../../../server/env";

/** Raw pass-through proxy for an Immich asset's thumbnail — see the sibling `people/$id/thumbnail` route. */
async function proxyToBackend({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}): Promise<Response> {
  const target = `${backendUrl}/immich/assets/${params.id}/thumbnail`;
  const response = await fetch(target, { headers: request.headers });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const Route = createFileRoute("/api/immich/assets/$id/thumbnail")({
  server: {
    handlers: {
      GET: proxyToBackend,
    },
  },
});
