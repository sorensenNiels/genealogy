import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useSyncExternalStore } from "react";

import { getImmichStatus } from "../server/functions/immich.functions";

export const immichStatusQueryKey = ["immich", "status"] as const;

/** The parts of the status query its readers use — per query state, so `isError` still narrows `error`. */
type ImmichStatusView =
  UseQueryResult<ImmichStatus> extends infer Result
    ? Result extends UseQueryResult<ImmichStatus>
      ? Pick<Result, "data" | "error" | "isError" | "isPending">
      : never
    : never;

/** What the server rendered: no answer yet. */
const NOT_YET_KNOWN: ImmichStatusView = {
  data: undefined,
  error: null,
  isError: false,
  isPending: true,
};

/** False on the server and while hydrating, true from then on — `useSyncExternalStore`'s server snapshot, as `useIsLocalhost` uses. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Whether the external Immich server is configured and answering — see
 * `ImmichService.status`. Immich is optional infrastructure on its own
 * server, and every photo/album feature makes no sense without it, so they
 * all gate on this one query (one cache entry for the whole app). The
 * backend caches its probe for 30s; `staleTime` matches so navigating
 * around doesn't refetch on every mount.
 *
 * Reads as still pending until the page has hydrated. The server renders
 * before the probe answers, but the answer can reach the browser's cache
 * before hydration does — and a Photos link or "Re-scan for faces" that
 * the client draws and the server didn't is a hydration mismatch. Not
 * prefetched in a loader instead: when Immich is down the probe waits up
 * to 3 s (`STATUS_TIMEOUT_MS`), which would hold up every server render.
 */
export function useImmichStatus(): ImmichStatusView {
  const query = useQuery({
    queryKey: immichStatusQueryKey,
    queryFn: () => getImmichStatus(),
    staleTime: 30_000,
  });
  return useHydrated() ? query : NOT_YET_KNOWN;
}

/** `true` only once Immich is confirmed usable — pending and failed both read as unavailable, so nothing photo-related flashes in and out. */
export function useImmichAvailable(): boolean {
  return useImmichStatus().data?.available === true;
}

export type ImmichStatus = Awaited<ReturnType<typeof getImmichStatus>>;

/** Why Immich can't be used, in the viewer's language — null when it can. */
export function immichUnavailableMessage(t: TFunction, status: ImmichStatus): string | null {
  if (status.available) return null;
  if (!status.configured) return t("immich.notConfigured");
  const detail = status.detail ?? "";
  switch (status.reason) {
    case "unreachable":
      return t("immich.reasonUnreachable", { detail });
    case "timeout":
      return t("immich.reasonTimeout");
    case "unauthorized":
      return t("immich.reasonUnauthorized");
    case "error":
      return t("immich.reasonError", { detail });
    default:
      return t("immich.unavailable");
  }
}
