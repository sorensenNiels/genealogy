import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Genealogical records change rarely; refetching on every focus is noise.
        staleTime: 30_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    // "en" is only the placeholder until the root route's own `beforeLoad`
    // resolves the real value per request — see __root.tsx.
    context: { queryClient, language: "en", role: "viewer" },
    defaultPreload: "intent",
    // Route loaders only prefetch into TanStack Query (see lib/queries.ts),
    // so Query's staleTime is the one source of truth for freshness. With
    // the router's own preload cache on top (30s by default), a hover
    // preload could mark a loader "done" and skip it on the real navigation
    // even after the query had been invalidated.
    defaultPreloadStaleTime: 0,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
