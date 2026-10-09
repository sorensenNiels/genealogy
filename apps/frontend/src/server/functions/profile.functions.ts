import { lastTreeViewSchema, updateProfileSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";

import { trpcProxy } from "../trpc-proxy-client";

/** The cookie name `trpc-error-translation-link.ts` reads per-call — kept a fast, request-local mirror of the account's own `language` field, never the source of truth itself. */
export const LANGUAGE_COOKIE = "lang";

export const getMyProfile = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.profile.myProfile.query(),
);

/**
 * Used from `__root.tsx`'s `beforeLoad`, once a session is confirmed present,
 * to pick the language SSR renders the very first HTML byte in — see
 * "Internationalization" in FEATURES.md for why this can't wait for a
 * client-side correction pass the way dark mode's placeholder-then-fix
 * `use-theme.ts` hook does. Also refreshes the `lang` cookie so the
 * error-translation link (a separate module, no route context of its own)
 * has a fast, request-local read of the same value without hitting the
 * database on every single error.
 */
export const getMyLanguage = createServerFn({ method: "GET" }).handler(async () => {
  const profile = await trpcProxy.profile.myProfile.query();
  const language = profile.language === "da" ? "da" : "en";
  setCookie(LANGUAGE_COOKIE, language, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return language;
});

export const getLastTreeView = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.profile.lastTreeView.query(),
);

export const saveLastTreeView = createServerFn({ method: "POST" })
  .validator(lastTreeViewSchema)
  .handler(({ data }) => trpcProxy.profile.saveLastTreeView.mutate(data));

export const updateProfile = createServerFn({ method: "POST" })
  .validator(updateProfileSchema)
  .handler(async ({ data }) => {
    const result = await trpcProxy.profile.updateProfile.mutate(data);
    if (data.language) {
      setCookie(LANGUAGE_COOKIE, data.language, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    return result;
  });
