/// <reference types="vite/client" />
import { themeToCss, type MemberRole } from "@genealogy/core";
import { Avatar, AvatarFallback } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@genealogy/ui/components/dropdown-menu";
import { Input } from "@genealogy/ui/components/input";
import { ThemeToggle } from "@genealogy/ui/components/theme-toggle";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  ClientOnly,
  createRootRouteWithContext,
  redirect,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  LanguagesIcon,
  LogOutIcon,
  NotebookTextIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { createI18nInstance, type SupportedLanguage } from "../i18n/create-i18n-instance";
import { authClient, useSession } from "../lib/auth-client";
import { useImmichAvailable } from "../lib/immich-status";
import { useOptimisticMutation } from "../lib/optimistic";
import { roleOf, usePermissions } from "../lib/permissions";
import { activeThemeQuery } from "../lib/queries";
import {
  deleteAllNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../server/functions/notification.functions";
import { getMyLanguage, updateProfile } from "../server/functions/profile.functions";
import { getSession } from "../server/functions/session.functions";

import appCss from "../styles.css?url";

export interface RouterContext {
  queryClient: QueryClient;
  language: SupportedLanguage;
  /** The signed-in member's role — see `usePermissions`. "viewer" (least access) when signed out. */
  role: MemberRole;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // The API gates all person data behind a session too (protectedProcedure,
  // proxied unchanged) — this redirect is just so an unauthenticated visitor
  // lands on /login instead of a page full of failed queries. Runs via a
  // server function (not the browser authClient) so it also works during SSR.
  //
  // Also resolves the language SSR renders in — see "Internationalization"
  // in FEATURES.md for why this can't wait for a client-side correction
  // pass the way dark mode's `use-theme.ts` placeholder-then-fix hook does:
  // translated text flashing from English to Danish after hydration would
  // be far more jarring than a one-frame icon flip.
  beforeLoad: async ({ location }): Promise<{ language: SupportedLanguage; role: MemberRole }> => {
    // The login page and an invitation link are the only pages a visitor
    // without an account can reach.
    if (location.pathname === "/login" || location.pathname.startsWith("/invite/")) {
      return { language: "en", role: "viewer" };
    }
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    const language = await getMyLanguage();
    return { language, role: roleOf(session) };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Genealogy" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  // The active theme is in the server-rendered <head> (see ThemeStyle), so
  // the page never paints in Nova first and then switches.
  loader: ({ context: { queryClient } }) => queryClient.prefetchQuery(activeThemeQuery()),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="p-8 text-muted-foreground">That page does not exist.</div>
  ),
});

function RootComponent() {
  const { language } = Route.useRouteContext();
  // A lazy `useState` initializer, not a plain `createI18nInstance(language)`
  // call — this must run exactly once (server: once per request; client:
  // once at mount) and then persist across re-renders, so the language
  // switcher's `i18n.changeLanguage()` mutates this same instance in place
  // instead of every render silently recreating it back to `language`. See
  // `create-i18n-instance.ts` for why it's one instance per page load
  // rather than one shared module-level singleton.
  const [i18nInstance] = useState(() => createI18nInstance(language));

  return (
    <I18nextProvider i18n={i18nInstance}>
      <RootDocument language={language}>
        <RootLayout />
      </RootDocument>
    </I18nextProvider>
  );
}

// TanStack Devtools in development only: the import sits behind
// `import.meta.env.DEV`, which Vite replaces with `false` in a production
// build, so the devtools never reach the production bundle.
const Devtools = import.meta.env.DEV ? lazy(() => import("./-devtools")) : null;

/**
 * The active theme as a stylesheet, after the app's own CSS so it overrides
 * Nova's defaults there. Rendered by React (not a static file), so choosing
 * another theme restyles the page at once — the query is invalidated, this
 * re-renders. `themeToCss` validates the theme again before writing a byte
 * of it; a theme that somehow fails is skipped, leaving Nova.
 */
function ThemeStyle() {
  const { data: theme } = useQuery(activeThemeQuery());
  if (!theme) return null;
  let css: string;
  try {
    css = themeToCss(theme.definition);
  } catch {
    return null;
  }
  return <style id="app-theme" dangerouslySetInnerHTML={{ __html: css }} />;
}

function RootDocument({
  children,
  language,
}: {
  children: ReactNode;
  language: SupportedLanguage;
}) {
  return (
    <html
      lang={language}
      // The anti-flash script below mutates this element's class before
      // hydration runs, so its class will legitimately differ from what was
      // server-rendered — that's the point, not a bug, so don't let React
      // warn about it.
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <ThemeStyle />
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
        {Devtools && (
          <ClientOnly>
            <Suspense>
              <Devtools />
            </Suspense>
          </ClientOnly>
        )}
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
 * a single section's card), the Tree view (a React Flow canvas that wants
 * every pixel it can get), and Photos (an album grid plus a filters sidebar,
 * the same "sidebar + wide content" shape as the People list) all have real
 * content that benefits from the browser's actual width on a
 * normal-or-wider monitor, so these opt out and stretch edge to edge. The
 * print route under `/people/$personId/print` is deliberately excluded —
 * it's laid out for paper, not a wide monitor.
 */
function isFullWidthPath(pathname: string): boolean {
  return (
    pathname === "/people" ||
    pathname === "/settings" ||
    pathname === "/profile" ||
    pathname === "/tools" ||
    pathname === "/tree" ||
    pathname === "/photos" ||
    /^\/people\/[^/]+$/.test(pathname) ||
    // An album's own page (toolbar + photo grid/book) is the same "wide
    // content" shape as /photos itself — missing this meant `<main>` flipped
    // from full-width to the narrow centered `max-w-5xl` column for one
    // frame while navigating from the album list into an album, visible as
    // a layout-shift flicker mid-navigation.
    /^\/photos\/[^/]+$/.test(pathname) ||
    // A record's transcription table has up to nine columns.
    /^\/records\/[^/]+$/.test(pathname)
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
  const { t } = useTranslation();
  // The page that's actually on screen, not the one being navigated to:
  // `useLocation()` switches the moment a navigation starts, while `<Outlet />`
  // keeps showing the old page until the new route has loaded — so a width
  // taken from it re-laid the *old* page at the *new* page's width for a few
  // frames (Overview's cards stretched full-width, People's table squeezed
  // into max-w-5xl), which read as a flicker on every switch between them.
  // `resolvedLocation` changes in the same render as the content.
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  const isFullWidth = isFullWidthPath(pathname);
  const isNoScroll = isNoScrollPath(pathname);

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
          <span className="font-semibold text-primary">{t("nav.brand")}</span>
          <span className="flex items-center gap-1">
            <Link
              to="/"
              className={NAV_LINK_CLASS}
              activeProps={NAV_LINK_ACTIVE_PROPS}
              activeOptions={{ exact: true }}
            >
              {t("nav.overview")}
            </Link>
            <Link to="/people" className={NAV_LINK_CLASS} activeProps={NAV_LINK_ACTIVE_PROPS}>
              {t("nav.people")}
            </Link>
            <Link to="/tree" className={NAV_LINK_CLASS} activeProps={NAV_LINK_ACTIVE_PROPS}>
              {t("nav.tree")}
            </Link>
            <PhotosNavLink />
          </span>
          <span className="ml-auto flex items-center gap-3">
            <HeaderSearch />
            <NotificationsBell />
            <ToolsLink />
            <SettingsLink />
            <ThemeToggle />
            <LanguageMenu />
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
type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];

/**
 * Polled, not pushed — this app has no real-time channel (no WebSocket/SSE;
 * see "Long-running work: BullMQ + a shared Redis" in TECH_STACK.md). A
 * backup takes anywhere from seconds to minutes, so a short poll interval
 * is responsive enough without adding a new transport for one feature.
 */
const NOTIFICATIONS_POLL_INTERVAL_MS = 15_000;

function NotificationsBell() {
  const { t } = useTranslation();
  const { data: session, isPending: sessionPending } = useSession();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => listNotifications(),
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
    enabled: !!session,
  });
  // Read state (and the badge count) changes on click, not after the round
  // trip — see `useOptimisticMutation`.
  const markReadMutation = useOptimisticMutation({
    mutationFn: markNotificationRead,
    queryKey: NOTIFICATIONS_KEY,
    update: (items: NotificationRow[], { data }) =>
      items.map((item) => (item.id === data.id ? { ...item, isRead: true } : item)),
  });
  const markAllReadMutation = useOptimisticMutation({
    mutationFn: () => markAllNotificationsRead(),
    queryKey: NOTIFICATIONS_KEY,
    update: (items: NotificationRow[]) => items.map((item) => ({ ...item, isRead: true })),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
  const deleteAllMutation = useMutation({
    mutationFn: deleteAllNotifications,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  if (sessionPending || !session) {
    return null;
  }

  const items = notifications.data ?? [];
  const unreadCount = items.filter((item) => !item.isRead).length;

  return (
    <DropdownMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("nav.notifications")}
        >
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
      }
      className="w-80"
      header={
        <DropdownMenuLabel className="mb-1 flex items-center justify-between border-b font-normal text-muted-foreground">
          {t("nav.notifications")}
          <span className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => markAllReadMutation.mutate()}
              >
                {t("notifications.markAllRead")}
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => deleteAllMutation.mutate()}
              >
                {t("notifications.deleteAll")}
              </button>
            )}
          </span>
        </DropdownMenuLabel>
      }
    >
      {items.length === 0 ? (
        <DropdownMenuItem disabled>{t("notifications.nothingYet")}</DropdownMenuItem>
      ) : (
        items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="items-start gap-0.5"
            onClick={() => {
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
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("text-sm", !item.isRead && "font-medium")}>{item.title}</span>
              {item.body && <span className="text-xs text-muted-foreground">{item.body}</span>}
            </span>
            <button
              type="button"
              aria-label={t("notifications.delete")}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              // Stops the click from reaching the menu item underneath, so a
              // delete doesn't also run the item's own onClick
              // (mark-as-read/navigate) first.
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                deleteMutation.mutate({ data: { id: item.id } });
              }}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuItem>
        ))
      )}
    </DropdownMenu>
  );
}

/**
 * Only shown while Immich is available — it's optional infrastructure on
 * its own server, and every photo/album feature is turned off without it
 * (see `useImmichStatus`). The status query is a signed-in-only procedure,
 * so it isn't even asked until there's a session.
 */
function PhotosNavLink() {
  const { data: session } = useSession();
  return session ? <PhotosNavLinkWhenAvailable /> : null;
}

function PhotosNavLinkWhenAvailable() {
  const { t } = useTranslation();
  if (!useImmichAvailable()) return null;
  return (
    <Link to="/photos" className={NAV_LINK_CLASS} activeProps={NAV_LINK_ACTIVE_PROPS}>
      {t("nav.photos")}
    </Link>
  );
}

/**
 * Full-text search from anywhere: Enter opens /search with the query, where
 * the results (and a bigger box) are. Signed-in only, like the search
 * procedure itself, and left out on /search, which has its own box.
 */
function HeaderSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [query, setQuery] = useState("");
  if (!session || pathname === "/search") return null;
  return (
    <search className="hidden md:block">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          const q = query.trim();
          setQuery("");
          void navigate({ to: "/search", search: q ? { q } : {} });
        }}
      >
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search.headerPlaceholder")}
          aria-label={t("search.label")}
          className="h-8 w-48 pl-8"
        />
      </form>
    </search>
  );
}

function ToolsLink() {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();
  const { isAdmin } = usePermissions();

  if (isPending || !session || !isAdmin) {
    return null;
  }

  return (
    <Link
      to="/tools"
      className="text-muted-foreground hover:text-foreground"
      activeProps={{ className: "text-foreground" }}
      aria-label={t("nav.tools")}
    >
      <WrenchIcon className="size-5" aria-hidden="true" />
    </Link>
  );
}

function SettingsLink() {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();
  const { isAdmin } = usePermissions();

  if (isPending || !session || !isAdmin) {
    return null;
  }

  return (
    <Link
      to="/settings"
      className="text-muted-foreground hover:text-foreground"
      activeProps={{ className: "text-foreground" }}
      aria-label={t("nav.settings")}
    >
      <SettingsIcon className="size-5" aria-hidden="true" />
    </Link>
  );
}

function SignInLink() {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();

  if (isPending || session) {
    return null;
  }

  return (
    <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
      {t("nav.signIn")}
    </Link>
  );
}

/**
 * Each language is named in itself ("Dansk", not "Danish"), so someone who
 * can't read the current UI language can still find their own — which is
 * why these aren't translation keys.
 */
const LANGUAGE_NAMES: Record<SupportedLanguage, string> = { en: "English", da: "Dansk" };

/**
 * Instant-apply, like `ThemeToggle`: `changeLanguage` re-renders every
 * `useTranslation()` consumer immediately, and `updateProfile` persists the
 * choice to the account (and refreshes the `lang` cookie the
 * backend-error-translation link reads) in the background. `i18n.language` is
 * the single source of truth — `beforeLoad` already seeded it from the
 * account. Hidden when signed out, like `UserMenu`, since the preference
 * lives on the account.
 */
function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const { data: session, isPending } = useSession();
  const updateProfileMutation = useMutation({ mutationFn: updateProfile });

  if (isPending || !session) {
    return null;
  }

  const current: SupportedLanguage = i18n.language === "da" ? "da" : "en";

  return (
    <DropdownMenu
      trigger={
        <Button
          variant="ghost"
          className="gap-1.5 px-2"
          aria-label={t("nav.language", { language: LANGUAGE_NAMES[current] })}
        >
          <LanguagesIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium uppercase">{current}</span>
        </Button>
      }
    >
      {(Object.keys(LANGUAGE_NAMES) as SupportedLanguage[]).map((language) => (
        <DropdownMenuItem
          key={language}

          onClick={() => {
            if (language === current) return;
            void i18n.changeLanguage(language);
            updateProfileMutation.mutate({ data: { language } });
          }}
        >
          <CheckIcon
            className={cn("size-4", language !== current && "invisible")}
            aria-hidden="true"
          />
          <span lang={language}>{LANGUAGE_NAMES[language]}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}

/** Replaces the old separate Profile icon + name + Sign out button with one trigger. */
function UserMenu() {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();

  if (isPending || !session) {
    return null;
  }

  const initial = session.user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu
      trigger={
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{session.user.name}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      }
      header={
        <DropdownMenuLabel className="mb-1 border-b font-normal text-muted-foreground">
          {session.user.email}
        </DropdownMenuLabel>
      }
    >
      <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
        <UserIcon className="size-4" aria-hidden="true" />
        {t("userMenu.profileSettings")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate({ to: "/notes" })}>
        <NotebookTextIcon className="size-4" aria-hidden="true" />
        {t("userMenu.myNotes")}
      </DropdownMenuItem>
      {isAdmin && (
        <DropdownMenuItem onClick={() => navigate({ to: "/members" })}>
          <UsersIcon className="size-4" aria-hidden="true" />
          {t("userMenu.members")}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={async () => {
          await authClient.signOut();
          // beforeLoad only re-checks the session on navigation, so without
          // this the page would just sit there failing every query with 401.
          await navigate({ to: "/login" });
        }}
      >
        <LogOutIcon className="size-4" aria-hidden="true" />
        {t("userMenu.signOut")}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
