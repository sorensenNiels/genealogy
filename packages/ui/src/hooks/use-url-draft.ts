import { useEffect, useRef, useState } from "react";

/**
 * A text field bound to a value in the URL: typing shows at once in the
 * field and reaches the URL (through `commit`) after a short pause, so a
 * route's query doesn't refetch on every keystroke.
 *
 * A change of `value` from outside — Back/Forward, a Reset button, a link —
 * replaces the draft, adjusted during render (React's pattern for state
 * derived from a prop). Except the value this hook just committed itself
 * coming back: by then the person may have typed on, and overwriting the
 * field with the older text would eat those keystrokes.
 *
 * `normalize` is what's actually sent (e.g. trimmed), so a trailing space
 * typed before the next word neither commits nor gets taken away.
 */
export function useUrlDraft(
  value: string,
  commit: (next: string) => void,
  normalize: (text: string) => string = (text) => text,
) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const [committed, setCommitted] = useState<string | null>(null);
  if (value !== synced) {
    setSynced(value);
    if (value !== committed) setDraft(value);
  }

  // The latest callbacks, without restarting the pause on every render.
  const latest = useRef({ commit, normalize });
  useEffect(() => {
    latest.current = { commit, normalize };
  });
  useEffect(() => {
    const next = latest.current.normalize(draft);
    if (next === value) return;
    const timer = setTimeout(() => {
      setCommitted(next);
      latest.current.commit(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return [draft, setDraft] as const;
}
