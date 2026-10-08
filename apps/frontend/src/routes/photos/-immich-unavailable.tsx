import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { immichUnavailableMessage, useImmichStatus } from "../../lib/immich-status";

/**
 * Renders `children` only while Immich is available, otherwise a placeholder
 * saying why not. The Photos nav link is already hidden in that case, so
 * this only shows for a bookmarked or typed-in `/photos` URL — or when
 * Immich goes away while the page is open. The leading `-` keeps TanStack
 * Start's router from treating this file as a route.
 */
export function RequireImmich({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const status = useImmichStatus();

  if (status.isPending) {
    return <p className="text-sm text-muted-foreground">{t("photosPage.loading")}</p>;
  }
  if (status.data?.available) return children;

  const reason = status.data
    ? immichUnavailableMessage(t, status.data)
    : t("immich.reasonError", { detail: status.error?.message ?? "" });
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <ImageIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-sm text-sm text-muted-foreground">{reason}</p>
      {status.data?.configured && (
        <p className="max-w-sm text-sm text-muted-foreground">{t("immich.featuresOff")}</p>
      )}
    </div>
  );
}
