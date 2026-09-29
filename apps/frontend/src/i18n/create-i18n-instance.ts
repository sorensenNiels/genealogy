import type { Language } from "@genealogy/core";
import { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import da from "./locales/da.json";
import en from "./locales/en.json";

/** Re-exported under this module's own name so callers don't need to know it's the same type `@genealogy/core`'s `updateProfileSchema` validates against. */
export type SupportedLanguage = Language;

/** `i18n.language` is plain `string` as far as i18next's own types know — narrows it to the app's actual two supported languages, falling back to English for anything else (a stale/unset cookie, a browser default i18next fell back to). */
export function toSupportedLanguage(language: string): SupportedLanguage {
  return language === "da" ? "da" : "en";
}

/**
 * A fresh instance per call, not one shared module-level singleton — this
 * app's own `trpc-proxy-client.ts` already documents a real bug that shape
 * causes during SSR: one Node process serves many users' requests
 * concurrently, so a single mutable "current language" would leak between
 * them exactly the way the auth cookie once did. All translations are
 * bundled at build time (no network fetch), so `.init()` completes
 * synchronously and the instance is usable immediately — no need to await
 * the promise it returns.
 *
 * Called once per page load (seeded from the language `__root.tsx`'s
 * `beforeLoad` resolved for that request) via a `useState` lazy initializer,
 * so the same instance persists across re-renders and `changeLanguage()`
 * calls from the language switcher update it in place.
 */
export function createI18nInstance(language: SupportedLanguage): I18nInstance {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: "en",
    resources: { en: { translation: en }, da: { translation: da } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}
