import { Button } from "@genealogy/ui/components/button";
import type { QueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { authClient, useSession } from "../lib/auth";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="p-8 text-muted-foreground">That page does not exist.</div>
  ),
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <span className="font-semibold">Genealogy</span>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-sm text-foreground font-medium" }}
            activeOptions={{ exact: true }}
          >
            Overview
          </Link>
          <Link
            to="/people"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-sm text-foreground font-medium" }}
          >
            People
          </Link>
          <span className="ml-auto">
            <SessionStatus />
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function SessionStatus() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return null;
  }

  if (!session) {
    return (
      <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{session.user.name}</span>
      <Button variant="outline" size="sm" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </div>
  );
}
