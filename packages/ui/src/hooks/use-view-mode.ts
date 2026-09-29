import { useCallback, useEffect, useState } from "react";

/**
 * Persists a page's chosen view mode (e.g. table vs. card) to localStorage
 * under a caller-supplied key, so different pages can each remember their
 * own last-used view independently. Starts from `defaultValue` rather than
 * reading localStorage synchronously, since this also renders under
 * TanStack Start's SSR (apps/frontend) where it doesn't exist — the mount
 * effect below (client-only, never run during SSR) corrects it immediately
 * after mount, the same placeholder-then-swap pattern as use-theme.ts.
 */
export function useViewMode<T extends string>(
  storageKey: string,
  validValues: readonly T[],
  defaultValue: T,
): [T, (next: T) => void] {
  const [mode, setModeState] = useState<T>(defaultValue);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored && (validValues as readonly string[]).includes(stored)) {
      // eslint-disable-next-line react/set-state-in-effect -- SSR safety, see use-theme.ts
      setModeState(stored as T);
    }
  }, [storageKey, validValues]);

  const setMode = useCallback(
    (next: T) => {
      setModeState(next);
      localStorage.setItem(storageKey, next);
    },
    [storageKey],
  );

  return [mode, setMode];
}
