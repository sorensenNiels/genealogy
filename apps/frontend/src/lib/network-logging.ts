/**
 * Wraps `fetch` with console logging and a hard timeout. Shared by the tRPC
 * client and the better-auth client — those two are the entire network
 * surface of the frontend, and a request that hangs is otherwise invisible:
 * the browser's Network tab shows "pending" forever with nothing in the
 * console to say whether the request was ever sent, whether a response ever
 * came back, or why not. This turns a silent hang into a logged timeout.
 */
const REQUEST_TIMEOUT_MS = 15_000;

let requestCounter = 0;

function describeUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function loggedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const id = ++requestCounter;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const url = describeUrl(input);
  const startedAt = performance.now();

  // console.log is banned project-wide (no-console); warn is the closest
  // allowed level for a routine trace line, not an actual warning.
  console.warn(`[net#${id}] -> ${method} ${url}`);

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[net#${id}] <- ${method} ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    timeoutController.abort();
  }, REQUEST_TIMEOUT_MS);

  // Combines the caller's own signal (e.g. React Query cancelling a stale
  // request) with our timeout, so either can abort — without one silently
  // overriding the other.
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  return fetch(input, { ...init, signal })
    .then((response) => {
      clearTimeout(timeoutId);
      const durationMs = Math.round(performance.now() - startedAt);
      console.warn(`[net#${id}] <- ${response.status} ${method} ${url} (${durationMs}ms)`);
      return response;
    })
    .catch((error: unknown) => {
      clearTimeout(timeoutId);
      const durationMs = Math.round(performance.now() - startedAt);
      console.error(`[net#${id}] <- ${method} ${url} failed after ${durationMs}ms`, error);
      throw error;
    });
}
