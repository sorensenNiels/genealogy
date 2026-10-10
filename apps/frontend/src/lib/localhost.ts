import { useSyncExternalStore } from "react";

/** Hostnames that mean "this is a developer's own machine". */
export function isLocalhostName(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

/**
 * Whether the app is being browsed on localhost — what gates the
 * development tools (the component showcase, …) on the Tools page.
 *
 * `null` on the server and while hydrating: the hostname is only known in
 * the browser, so the server render and the hydrating client render agree
 * on "don't know yet" (`useSyncExternalStore`'s server snapshot), and the
 * real answer follows straight after — no mismatch, no flashed guess. A presentation gate, not a security one — the pages behind it hold
 * no data and are admin-only anyway.
 */
export function useIsLocalhost(): boolean | null {
  return useSyncExternalStore(
    // The hostname never changes while the page is open — nothing to subscribe to.
    () => () => {},
    () => isLocalhostName(window.location.hostname),
    () => null,
  );
}
