import type { AppRouter } from "@genealogy/backend";
import { getCookie } from "@tanstack/react-start/server";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";

import { translateBackendError } from "../i18n/backend-errors";
import type { SupportedLanguage } from "../i18n/create-i18n-instance";
import { LANGUAGE_COOKIE } from "./functions/profile.functions";

/**
 * Translates every tRPC error's `.message` from apps/backend's own English
 * into the current request's language, in exactly one place — see
 * "Internationalization" in FEATURES.md for why this is a link ahead of
 * `httpLink` rather than a change to any of the ~40 server function files
 * that call `trpcProxy`: they already just return/throw the call result
 * as-is, so none of them need editing.
 *
 * Reads the `lang` cookie fresh on every call, never captured at module
 * scope — the exact same reasoning `httpLink`'s own `fetch` override
 * documents for the auth cookie: one Node process serves many concurrent
 * requests, so a value read once and reused would leak between them.
 */
export function errorTranslationLink(): TRPCLink<AppRouter> {
  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        const subscription = next(op).subscribe({
          next(value) {
            observer.next(value);
          },
          error(error) {
            const language: SupportedLanguage = getCookie(LANGUAGE_COOKIE) === "da" ? "da" : "en";
            if (typeof error.message === "string") {
              error.message = translateBackendError(error.message, language);
            }
            observer.error(error);
          },
          complete() {
            observer.complete();
          },
        });
        return () => subscription.unsubscribe();
      });
    };
  };
}
