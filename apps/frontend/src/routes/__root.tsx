/// <reference types="vite/client" />
import { Avatar, AvatarFallback } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@genealogy/ui/components/dropdown-menu";
import { ThemeToggle } from "@genealogy/ui/components/theme-toggle";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
import {
  BellIcon,
  ChevronDownIcon,
  LogOutIcon,
  NotebookTextIcon,
  SettingsIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { authClient, useSession } from "../lib/auth-client";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../server/functions/notification.functions";
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
 * plus a filters sidebar), a person's own detail page (a header card plus a
 * Parents/Spouses/Children grid), Settings/Profile (a category sidebar plus
 * a single section's card), and the Tree view (a React Flow canvas that
 * wants every pixel it can get) all have real content that benefits from
 * the browser's actual width on a normal-or-wider monitor, so these opt out
 * and stretch edge to edge. The print route under `/people/$personId/print`
 * is deliberately excluded — it's laid out for paper, not a wide monitor.
 */
function isFullWidthPath(pathname: string): boolean {
  return (
    pathname === "/people" ||
    pathname === "/settings" ||
    pathname === "/profile" ||
    pathname === "/tools" ||
    pathname === "/tree" ||
    /^\/people\/[^/]+$/.test(pathname)
  );
}

/**
 * The Tree view lays out its own internal scroll regions (the detail panel,
 * the React Flow canvas) and never wants the outer page to scroll — a page
 * scrollbar on top of that would mean two independent scroll surfaces
 * fighting for the same content. So only this route pins the whole layout to
 * exactly the viewport height (`h-screen` + `overflow-hidden` below) instead
 * of the default `min-h-screen`, which lets ordinary pages grow past one
 * screen and scroll normally.
 */
function isNoScrollPath(pathname: string): boolean {
  return pathname === "/tree";
}

// A pill highlight rather than just a color/weight change, so the current
// section is easy to spot at a glance rather than needing a second look.
const NAV_LINK_CLASS =
  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
const NAV_LINK_ACTIVE_PROPS = {
  className: "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-foreground",
};

function RootLayout() {
  const location = useLocation();
  const isFullWidth = isFullWidthPath(location.pathname);
  const isNoScroll = isNoScrollPath(location.pathname);

  return (
    <div
      className={cn(
        "bg-background text-foreground",
        isNoScroll ? "flex h-screen flex-col overflow-hidden" : "min-h-screen",
      )}
    >
      <header className="border-b bg-card print:hidden">
        <div className="h-0.75 bg-primary" aria-hidden="true" />
        <nav className="flex w-full items-center gap-6 px-6 py-4">
          <span className="font-semibold text-primary">Genealogy</span>
          <span className="flex items-center gap-1">
            <Link
              to="/"
              className={NAV_LINK_CLASS}
              activeProps={NAV_LINK_ACTIVE_PROPS}
              activeOptions={{ exact: true }}
            >
              Overview
            </Link>
            <Link to="/people" className={NAV_LINK_CLASS} activeProps={NAV_LINK_ACTIVE_PROPS}>
              People
            </Link>
            <Link to="/tree" className={NAV_LINK_CLASS} activeProps={NAV_LINK_ACTIVE_PROPS}>
              Tree
            </Link>
            <Link to="/photos" className={NAV_LINK_CLASS} activeProps={NAV_LINK_ACTIVE_PROPS}>
              Photos
            </Link>
          </span>
          <span className="ml-auto flex items-center gap-3">
            <NotificationsBell />
            <ToolsLink />
            <SettingsLink />
            <ThemeToggle />
            <UserMenu />
            <SignInLink />
          </span>
        </nav>
      </header>
      <main
        className={cn(
          "mx-auto px-6 py-8",
          isFullWidth ? "w-full" : "max-w-5xl",
          isNoScroll && "flex-1 overflow-hidden",
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}

const NOTIFICATIONS_KEY = ["notifications"];

/**
 * Polled, not pushed — this app has no real-time channel (no WebSocket/SSE;
 * see "Long-running work: BullMQ + a shared Redis" in TECH_STACK.md). A
 * backup takes anywhere from seconds to minutes, so a short poll interval
 * is responsive enough without adding a new transport for one feature.
 */
const NOTIFICATIONS_POLL_INTERVAL_MS = 15_000;

function NotificationsBell() {
  const { data: session, isPending: sessionPending } = useSession();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => listNotifications(),
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
    enabled: !!session,
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  if (sessionPending || !session) {
    return null;
  }

  const items = notifications.data ?? [];
  const unreadCount = items.filter((item) => !item.isRead).length;

  return (
    <DropdownMenu>
      <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
        <BellIcon className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>
      <DropdownMenuContent
        className="w-80"
        header={
          <DropdownMenuLabel className="mb-1 flex items-center justify-between border-b font-normal text-muted-foreground">
            Notifications
            {unreadCount > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => markAllReadMutation.mutate()}
              >
                Mark all read
              </button>
            )}
          </DropdownMenuLabel>
        }
      >
        {items.length === 0 ? (
          <DropdownMenuItem isDisabled>Nothing yet</DropdownMenuItem>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="flex-col items-start gap-0.5"
              onAction={() => {
                if (!item.isRead) {
                  markReadMutation.mutate({ data: { id: item.id } });
                }
                // A file download (Content-Disposition: attachment), not a
                // page — a plain navigation is enough to trigger the
                // browser's save dialog, same as tools.tsx's download link.
                if (item.actionUrl) {
                  window.location.href = item.actionUrl;
                }
              }}
            >
              <span className={cn("text-sm", !item.isRead && "font-medium")}>{item.title}</span>
              {item.body && <span className="text-xs text-muted-foreground">{item.body}</span>}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToolsLink() {
  const { data: session, isPending } = useSession();

  if (isPending || !session) {
    return null;
  }

  return (
    <Link
      to="/tools"
      className="text-muted-foreground hover:text-foreground"
      activeProps={{ className: "text-foreground" }}
      aria-label="Tools"
    >
      <WrenchIcon className="size-5" aria-hidden="true" />
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

function SignInLink() {
  const { data: session, isPending } = useSession();

  if (isPending || session) {
    return null;
  }

  return (
    <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
      Sign in
    </Link>
  );
}

/** Replaces the old separate Profile icon + name + Sign out button with one trigger. */
function UserMenu() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  if (isPending || !session) {
    return null;
  }

  const initial = session.user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <Button variant="ghost" className="gap-2 px-2">
        <Avatar className="size-6">
          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{session.user.name}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      </Button>
      <DropdownMenuContent
        header={
          <DropdownMenuLabel className="mb-1 border-b font-normal text-muted-foreground">
            {session.user.email}
          </DropdownMenuLabel>
        }
      >
        <DropdownMenuItem onAction={() => navigate({ to: "/profile" })}>
          <UserIcon className="size-4" aria-hidden="true" />
          Profile settings
        </DropdownMenuItem>
        <DropdownMenuItem onAction={() => navigate({ to: "/notes" })}>
          <NotebookTextIcon className="size-4" aria-hidden="true" />
          My Notes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onAction={async () => {
            await authClient.signOut();
            // beforeLoad only re-checks the session on navigation, so without
            // this the page would just sit there failing every query with 401.
            await navigate({ to: "/login" });
          }}
        >
          <LogOutIcon className="size-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
