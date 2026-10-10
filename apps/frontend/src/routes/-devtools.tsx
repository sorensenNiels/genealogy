import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

/**
 * TanStack Devtools: one floating panel (bottom corner) with Query, Router
 * and Form tabs — the cache and its queries, the route tree and matches,
 * every live TanStack Form's state. Development only: `__root.tsx` lazy-loads
 * this file behind `import.meta.env.DEV`, so production builds don't include
 * it at all, and inside `ClientOnly`, so it never server-renders.
 */
export default function Devtools() {
  return (
    <TanStackDevtools
      plugins={[
        { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
        { name: "TanStack Router", render: <TanStackRouterDevtoolsPanel /> },
        formDevtoolsPlugin(),
      ]}
    />
  );
}
