/// <reference types="vite/client" />
import { Button } from "@genealogy/ui/components/button";
import { ThemeToggle } from "@genealogy/ui/components/theme-toggle";
import { cn } from "@genealogy/ui/lib/utils";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { SettingsIcon, UserIcon } from "lucide-react";
import type { ReactNode } from "react";

import { authClient, useSession } from "../lib/auth-client";
import { getSession } from "../server/functions/session.functions";

import appCss from "../styles.css?url";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // The API gates all person data behind a session too (protectedProcedure,
  // proxied unchanged) — this redirect is just so an unauthenticated visitor
  // lands on /login instead of a page full of failed queries. Runs via a
  // server function (not the browser authClient) so it also works during SSR.
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/login") return;
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Genealogy" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="p-8 text-muted-foreground">That page does not exist.</div>
  ),
});

function RootComponent() {
  return (
    <RootDocument>
      <RootLayout />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      // The anti-flash script below mutates this element's class before
      // hydration runs, so its class will legitimately differ from what was
      // server-rendered — that's the point, not a bug, so don't let React
      // warn about it.
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <script
          // Mirrors packages/ui/src/hooks/use-theme.ts's resolution, applied
          // synchronously before any stylesheet paints so there's no flash of
          // the wrong theme. Keep the storage key in sync with that file by hand.
          dangerouslySetInnerHTML={{
            __html: `(function () {
              var stored = localStorage.getItem("genealogy-theme");
              var dark =
                stored === "dark" ||
                (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
              document.documentElement.classList.toggle("dark", dark);
            })();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Most pages are forms/cards that read better at a fixed, centered width —
 * `max-w-5xl` is the default. The People list (a data table with six columns
 * plus a filters sidebar) and a person's own detail page (a header card plus
 * a Parents/Spouses/Children grid) both have real content that benefits from
 * the browser's actual width on a normal-or-wider monitor, so these two opt
 * out and stretch edge to edge. The print route under
 * `/people/$personId/print` is deliberately excluded — it's laid out for
 * paper, not a wide monitor.
 */
function isFullWidthPath(pathname: string): boolean {
  return pathname === "/people" || /^\/people\/[^/]+$/.test(pathname);
}

function RootLayout() {
  const location = useLocation();
  const isFullWidth = isFullWidthPath(location.pathname);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b print:hidden">
        <nav className="flex w-full items-center gap-6 px-6 py-4">
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
          <Link
            to="/tree"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-sm text-foreground font-medium" }}
          >
            Tree
          </Link>
          <Link
            to="/photos"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-sm text-foreground font-medium" }}
          >
            Photos
          </Link>
          <span className="ml-auto flex items-center gap-3">
            <ProfileLink />
            <SettingsLink />
            <ThemeToggle />
            <SessionStatus />
          </span>
        </nav>
      </header>
      <main className={cn("mx-auto px-6 py-8", isFullWidth ? "w-full" : "max-w-5xl")}>
        <Outlet />
      </main>
    </div>
  );
}

function ProfileLink() {
  const { data: session, isPending } = useSession();

  if (isPending || !session) {
    return null;
  }

  return (
    <Link
      to="/profile"
      className="text-muted-foreground hover:text-foreground"
      activeProps={{ className: "text-foreground" }}
      aria-label="Profile"
    >
      <UserIcon className="size-5" aria-hidden="true" />
    </Link>
  );
}

function SettingsLink() {
  const { data: session, isPending } = useSession();

  if (isPending || !session) {
    return null;
  }

  return (
    <Link
      to="/settings"
      className="text-muted-foreground hover:text-foreground"
      activeProps={{ className: "text-foreground" }}
      aria-label="Settings"
    >
      <SettingsIcon className="size-5" aria-hidden="true" />
    </Link>
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
