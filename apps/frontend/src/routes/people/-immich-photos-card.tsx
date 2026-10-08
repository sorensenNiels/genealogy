import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Button } from "@genealogy/ui/components/button";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useImmichAvailable } from "../../lib/immich-status";
import { usePermissions } from "../../lib/permissions";
import {
  linkImmichPerson,
  listLinkedImmichPeople,
  listPersonPhotos,
  unlinkImmichPerson,
} from "../../server/functions/immich.functions";
import { AssetViewer } from "../photos/-asset-viewer";
import { UploadDialog } from "../photos/-upload-dialog";
import { ImmichPersonPicker } from "./-immich-person-picker";

/**
 * A person's linked-face photo grid — see "Photos & albums via Immich" in
 * FEATURES.md. Not part of `$personId.tsx` itself despite every other
 * section of that page living there: that file is already large, and this
 * one is fully self-contained (its own data, its own dialog). The leading
 * `-` keeps TanStack Start's file-based router from treating it as a route.
 * Hidden entirely, not just empty, when Immich isn't available — no reason
 * to show a "Photos" card that can only ever say "not set up".
 */
export function PersonPhotosCard({ personId }: { personId: string }) {
  if (!useImmichAvailable()) return null;
  return <PersonPhotosCardContent personId={personId} />;
}

function PersonPhotosCardContent({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const linked = useQuery({
    queryKey: ["immich", "linkedPeople", personId],
    queryFn: () => listLinkedImmichPeople({ data: { personId } }),
  });
  const photos = useQuery({
    queryKey: ["immich", "photos", personId],
    queryFn: () => listPersonPhotos({ data: { personId } }),
  });
  const unlinkMutation = useMutation({ mutationFn: unlinkImmichPerson });
  const { canEdit } = usePermissions();

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["immich", "linkedPeople", personId] }),
      queryClient.invalidateQueries({ queryKey: ["immich", "photos", personId] }),
    ]);
  };

  const unlink = async (linkId: string) => {
    await unlinkMutation.mutateAsync({ data: { linkId } });
    await refresh();
  };

  return (
    <SectionCard
      title={t("person.photos.title")}
      titleClassName="text-base"
      contentClassName="space-y-4"
      action={
        <div className="flex gap-2">
          <UploadDialog
            trigger={
              <Button type="button" variant="outline" size="sm">
                {t("person.photos.upload")}
              </Button>
            }
            onUploaded={refresh}
          />
          <LinkFaceDialog personId={personId} onLinked={refresh} />
        </div>
      }
    >
      {linked.data && linked.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {linked.data.map((person) => (
            <span
              key={person.linkId}
              className="flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-1 text-xs"
            >
              <Avatar className="size-5">
                <AvatarImage src={`/api/immich/people/${person.id}/thumbnail`} alt="" />
                <AvatarFallback className="text-[10px]">?</AvatarFallback>
              </Avatar>
              {person.name.trim() || t("common.unnamedPerson")}
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-4"
                  aria-label={t("person.photos.unlinkAria", {
                    name: person.name.trim() || t("person.photos.unlinkThisFace"),
                  })}
                  onPress={() => void unlink(person.linkId)}
                >
                  <XIcon className="size-3" />
                </Button>
              )}
            </span>
          ))}
        </div>
      )}
      {photos.isPending ? (
        <p className="text-xs text-muted-foreground">{t("person.photos.loadingPhotos")}</p>
      ) : photos.data && photos.data.length > 0 ? (
        <>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {photos.data.map((asset, index) => (
              <Button
                key={asset.id}
                variant="ghost"
                onPress={() => setOpenIndex(index)}
                className="aspect-square h-auto w-full overflow-hidden rounded bg-muted p-0"
              >
                <img
                  src={`/api/immich/assets/${asset.id}/thumbnail`}
                  alt={asset.originalFileName}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </Button>
            ))}
          </div>
          <AssetViewer
            assets={photos.data}
            index={openIndex}
            onIndexChange={setOpenIndex}
            onClose={() => setOpenIndex(null)}
            onFaceTagged={refresh}
            onAssetRemoved={refresh}
          />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("person.photos.noLinkedPhotos")}</p>
      )}
    </SectionCard>
  );
}

function LinkFaceDialog({
  personId,
  onLinked,
}: {
  personId: string;
  onLinked: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const linkMutation = useMutation({ mutationFn: linkImmichPerson });

  const link = async (immichPersonId: string, close: () => void) => {
    setError(null);
    try {
      await linkMutation.mutateAsync({ data: { personId, immichPersonId } });
      close();
      await onLinked();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : t("person.photos.couldNotLink"),
      );
    }
  };

  return (
    <FormDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          {t("person.photos.linkFace")}
        </Button>
      }
      title={t("person.photos.linkFaceTitle")}
      onOpenChange={(next) => {
        if (!next) setError(null);
      }}
    >
      {(close) => (
        <>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <ImmichPersonPicker
            isDisabled={linkMutation.isPending}
            onPick={(immichPersonId) => void link(immichPersonId, close)}
          />
        </>
      )}
    </FormDialog>
  );
}
