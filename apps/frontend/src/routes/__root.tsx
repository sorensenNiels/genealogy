import { Button } from "@genealogy/ui/components/button";
import { ThemeToggle } from "@genealogy/ui/components/theme-toggle";
import type { QueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  redirect,
  useNavigate,
} from "@tanstack/react-router";

import { authClient, useSession } from "../lib/auth";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // The API gates all person data behind a session too (protectedProcedure) —
  // this redirect is just so an unauthenticated visitor lands on /login
  // instead of a page full of failed queries.
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/login") return;
    const { data: session } = await authClient.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  component: RootLayout,
  notFoundComponent: () => (
    <div className="p-8 text-muted-foreground">That page does not exist.</div>
  ),
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b print:hidden">
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
          <span className="ml-auto flex items-center gap-3">
            <ThemeToggle />
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
  const navigate = useNavigate();

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
      <Button
        variant="outline"
        size="sm"
        onPress={async () => {
          await authClient.signOut();
          // beforeLoad only re-checks the session on navigation, so without
          // this the page would just sit there failing every query with 401.
          await navigate({ to: "/login" });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
