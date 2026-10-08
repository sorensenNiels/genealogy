import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";

import { getImmichStatus } from "../server/functions/immich.functions";

export const immichStatusQueryKey = ["immich", "status"] as const;

/**
 * Whether the external Immich server is configured and answering — see
 * `ImmichService.status`. Immich is optional infrastructure on its own
 * server, and every photo/album feature makes no sense without it, so they
 * all gate on this one query (one cache entry for the whole app). The
 * backend caches its probe for 30s; `staleTime` matches so navigating
 * around doesn't refetch on every mount.
 */
export function useImmichStatus() {
  return useQuery({
    queryKey: immichStatusQueryKey,
    queryFn: () => getImmichStatus(),
    staleTime: 30_000,
  });
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
