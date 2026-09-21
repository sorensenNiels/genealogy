import { useCallback, useRef, useState } from "react";

export interface UseCopyToClipboardResult {
  /** Copies `text`; `copied` flips to true briefly to drive UI feedback. */
  copy: (text: string) => void;
  copied: boolean;
}

/**
 * `copied` resets after `resetDelayMs` — long enough for a viewer to notice a
 * checkmark, short enough that clicking again while it's still showing reads
 * as a fresh confirmation rather than a stuck state.
 */
export function useCopyToClipboard(resetDelayMs = 1500): UseCopyToClipboardResult {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    (text: string) => {
      void (async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), resetDelayMs);
      })();
    },
    [resetDelayMs],
  );

  return { copy, copied };
}
