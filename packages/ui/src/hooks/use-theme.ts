import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark";
export type Theme = "light" | "dark";

// Kept in sync by hand with the inline script in apps/frontend/index.html,
// which applies the same resolution synchronously before React mounts so the
// first paint never flashes the wrong theme.
const STORAGE_KEY = "genealogy-theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(preference: ThemePreference | null): Theme {
  return preference ?? (systemPrefersDark() ? "dark" : "light");
}

function readStoredPreference(): ThemePreference | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

export interface UseThemeResult {
  /** The resolved theme actually applied to the page. */
  theme: Theme;
  /** The user's stored override, or `null` when following the system setting. */
  preference: ThemePreference | null;
  /** Pass `null` to go back to following the system setting. */
  setPreference: (preference: ThemePreference | null) => void;
}

/**
 * A stored preference always wins; absent one, the resolved theme tracks the
 * OS setting live via `matchMedia`.
 */
export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference | null>(readStoredPreference);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(preference));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (preference !== null) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(resolveTheme(null));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference | null) => {
    setPreferenceState(next);
    setTheme(resolveTheme(next));
    if (next === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return { theme, preference, setPreference };
}
