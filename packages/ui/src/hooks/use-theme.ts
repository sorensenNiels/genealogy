import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark";
export type Theme = "light" | "dark";

// Kept in sync by hand with the inline script in apps/frontend/index.html,
// which applies the same resolution synchronously before React mounts so the
// first paint never flashes the wrong theme.
const STORAGE_KEY = "genealogy-theme";

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
  // Both start from a placeholder rather than reading localStorage/matchMedia
  // synchronously, since this hook now also renders under TanStack Start's
  // SSR (apps/frontend) where neither exists — the mount effect below (client
  // -only, never run during SSR) corrects them immediately after mount, and
  // `theme` is derived from the two rather than stored separately, so that
  // effect is a single setState rather than several in cascade. The inline
  // script in the document head already applies the right class to <html>
  // before hydration, so there's no flash of the wrong page background;
  // only a component that renders differently by theme (ThemeToggle's own
  // icon) can show the wrong one for one frame, which self-corrects here.
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);
  const [systemDark, setSystemDark] = useState(false);
  const theme: Theme = preference ?? (systemDark ? "dark" : "light");

  useEffect(() => {
    // Reads an external system (localStorage) that doesn't exist during SSR
    // — not a value derivable during render, so the lint rule's usual
    // "derive it instead" advice doesn't apply here.
    // eslint-disable-next-line react/set-state-in-effect
    setPreferenceState(readStoredPreference());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    // Same as above: matchMedia doesn't exist during SSR.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react/set-state-in-effect
    setSystemDark(media.matches);
    if (preference !== null) return;
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference | null) => {
    setPreferenceState(next);
    if (next === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return { theme, preference, setPreference };
}
