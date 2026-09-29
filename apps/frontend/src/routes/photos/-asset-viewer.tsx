import { Button } from "@genealogy/ui/components/button";
import { FaceBoxOverlay, type FaceBox } from "@genealogy/ui/components/face-box-overlay";
import { ImageViewer } from "@genealogy/ui/components/image-viewer";
import { Input } from "@genealogy/ui/components/input";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { TagInput } from "@genealogy/ui/components/tag-input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  deleteImmichAssets,
  getImmichAssetDetail,
  listImmichAssetFaces,
  listImmichTags,
  removeImmichAlbumAssets,
  setImmichAssetTags,
  unlinkImmichPerson,
  updateImmichAssetDescription,
} from "../../server/functions/immich.functions";
import { TagFaceDialog } from "./-tag-face-dialog";

export interface ViewableAsset {
  id: string;
  originalFileName: string;
}

/**
 * Full-size photo + detected-face overlay, opened from any thumbnail grid in
 * `/photos`. Takes the whole list currently on screen plus an index rather
 * than a single asset id, so previous/next can step through it without a
 * second endpoint — same reasoning `$albumId.tsx`'s own comment gives for
 * not adding a "get one album" call until one was actually needed.
 */
export function AssetViewer({
  assets,
  index,
  onIndexChange,
  onClose,
  onFaceTagged,
  albumId,
  onAssetRemoved,
  captionPlaceholder,
  onCaptionSaved,
}: {
  assets: ViewableAsset[];
  /** `null` — nothing open. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** For a caller with its own person/album-scoped queries that also need invalidating once a face is tagged (e.g. `PersonPhotosCard`'s linked-photos list) — this component's own `assetFaces`/`listPeople` invalidation always runs regardless. */
  onFaceTagged?: () => Promise<void>;
  /** Present → offers "Remove from album" (unlink only, the asset stays in Immich) alongside "Delete photo" (removes it from Immich entirely). Without it, only "Delete photo" is offered — there's no album context to remove it from. */
  albumId?: string;
  /** Called after either destructive action succeeds, once the viewer has already closed itself, so the caller can refetch its own list. */
  onAssetRemoved?: () => Promise<void>;
  /** Shown in the empty caption field, e.g. "Copenhagen, 1965" from the album's own date/place — never pre-filled as a real value. */
  captionPlaceholder?: string;
  /** For a caller tracking which photos still need a caption (e.g. `$albumId.tsx`'s review queue) — fires right after a caption save succeeds, so it can update its own set without a refetch. */
  onCaptionSaved?: (assetId: string, description: string) => void;
}) {
  const { t } = useTranslation();
  const [tagFaceId, setTagFaceId] = useState<string | null>(null);
  // Keyed by asset id, not just a bare string, so switching photos (prev/next
  // or reopening from the grid) never shows a previous photo's unsaved draft
  // — compared against the current asset during render instead of resetting
  // via an effect.
  const [captionDraft, setCaptionDraft] = useState<{ assetId: string; value: string } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const removeFromAlbumMutation = useMutation({ mutationFn: removeImmichAlbumAssets });
  const deleteAssetsMutation = useMutation({ mutationFn: deleteImmichAssets });
  const unlinkMutation = useMutation({ mutationFn: unlinkImmichPerson });
  const updateDescriptionMutation = useMutation({ mutationFn: updateImmichAssetDescription });
  const setTagsMutation = useMutation({ mutationFn: setImmichAssetTags });

  const asset = index !== null ? assets[index] : undefined;

  const facesQuery = useQuery({
    queryKey: ["immich", "assetFaces", asset?.id],
    queryFn: () => listImmichAssetFaces({ data: { assetId: asset!.id } }),
    enabled: asset !== undefined,
  });
  const detailQuery = useQuery({
    queryKey: ["immich", "assetDetail", asset?.id],
    queryFn: () => getImmichAssetDetail({ data: { assetId: asset!.id } }),
    enabled: asset !== undefined,
  });
  const tagsQuery = useQuery({
    queryKey: ["immich", "tags"],
    queryFn: () => listImmichTags(),
  });

  if (index === null || !asset) return null;

  const draftForThisAsset = captionDraft?.assetId === asset.id ? captionDraft.value : null;
  const caption = draftForThisAsset ?? detailQuery.data?.description ?? "";
  const tagNames = detailQuery.data?.tags.map((tag) => tag.name) ?? [];

  const saveCaption = async (): Promise<void> => {
    if (draftForThisAsset === null || draftForThisAsset === detailQuery.data?.description) return;
    await updateDescriptionMutation.mutateAsync({
      data: { assetId: asset.id, description: draftForThisAsset },
    });
    await queryClient.invalidateQueries({ queryKey: ["immich", "assetDetail", asset.id] });
    onCaptionSaved?.(asset.id, draftForThisAsset);
  };

  const saveTags = async (nextTagNames: string[]): Promise<void> => {
    await setTagsMutation.mutateAsync({ data: { assetId: asset.id, tagNames: nextTagNames } });
    await queryClient.invalidateQueries({ queryKey: ["immich", "assetDetail", asset.id] });
    await queryClient.invalidateQueries({ queryKey: ["immich", "tags"] });
  };

  const faces = facesQuery.data ?? [];
  const boxes: FaceBox[] = faces.map((face) => ({
    id: face.id,
    left: face.box.left,
    top: face.box.top,
    width: face.box.width,
    height: face.box.height,
    ...(face.immichPerson?.name.trim() ? { label: face.immichPerson.name.trim() } : {}),
    state: face.linkedPerson ? "linked" : face.immichPerson ? "untagged" : "unknown",
  }));

  const handleBoxPress = (faceId: string): void => {
    const face = faces.find((candidate) => candidate.id === faceId);
    if (!face) return;
    if (face.linkedPerson) {
      onClose();
      void navigate({ to: "/people/$personId", params: { personId: face.linkedPerson.personId } });
      return;
    }
    setTagFaceId(faceId);
  };

  const handleUnlinkPress = async (faceId: string): Promise<void> => {
    const face = faces.find((candidate) => candidate.id === faceId);
    if (!face?.linkedPerson) return;
    await unlinkMutation.mutateAsync({ data: { linkId: face.linkedPerson.linkId } });
    await queryClient.invalidateQueries({ queryKey: ["immich", "assetFaces", asset.id] });
    await onFaceTagged?.();
  };

  const tagFace = faces.find((candidate) => candidate.id === tagFaceId) ?? null;

  const removeFromAlbum = async (): Promise<void> => {
    if (!albumId) return;
    await removeFromAlbumMutation.mutateAsync({ data: { albumId, assetIds: [asset.id] } });
    onClose();
    await onAssetRemoved?.();
  };

  const deletePhoto = async (): Promise<void> => {
    await deleteAssetsMutation.mutateAsync({ data: { assetIds: [asset.id] } });
    onClose();
    await onAssetRemoved?.();
  };

  const footer = (
    <div className="w-full max-w-md space-y-3">
      <div className="space-y-2 text-white">
        <Input
          aria-label={t("assetViewer.caption")}
          placeholder={captionPlaceholder ?? t("assetViewer.captionPlaceholder")}
          value={caption}
          onChange={(event) => setCaptionDraft({ assetId: asset.id, value: event.target.value })}
          onBlur={() => void saveCaption()}
          className="border-white/30 bg-white/10 text-white placeholder:text-white/60"
        />
        <TagInput
          value={tagNames}
          onChange={(next) => void saveTags(next)}
          suggestions={(tagsQuery.data ?? []).map((tag) => tag.name)}
        />
      </div>
      <div className="flex justify-end gap-2">
        {albumId && (
          <RemoveButton
            itemLabel={t("assetViewer.thisPhotoFromAlbum")}
            title={t("assetViewer.removePhotoTitle")}
            description={t("assetViewer.removePhotoDescription")}
            actionLabel={t("common.remove")}
            trigger={
              <Button type="button" variant="outline" size="sm">
                {t("assetViewer.removeFromAlbum")}
              </Button>
            }
            onConfirm={() => void removeFromAlbum()}
          />
        )}
        <RemoveButton
          itemLabel={t("assetViewer.thisPhoto")}
          title={t("assetViewer.deletePhotoTitle")}
          description={t("assetViewer.deletePhotoDescription")}
          actionLabel={t("common.delete")}
          trigger={
            <Button type="button" variant="destructive" size="sm">
              {t("assetViewer.deletePhoto")}
            </Button>
          }
          onConfirm={() => void deletePhoto()}
        />
      </div>
    </div>
  );

  return (
    <>
      <ImageViewer
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={asset.originalFileName}
        footer={footer}
        {...(index > 0 ? { onPrevious: () => onIndexChange(index - 1) } : {})}
        {...(index < assets.length - 1 ? { onNext: () => onIndexChange(index + 1) } : {})}
      >
        <FaceBoxOverlay
          src={`/api/immich/assets/${asset.id}/preview`}
          alt={asset.originalFileName}
          boxes={boxes}
          onBoxPress={handleBoxPress}
          onUnlinkPress={(faceId) => void handleUnlinkPress(faceId)}
        />
      </ImageViewer>
      {tagFace && (
        <TagFaceDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setTagFaceId(null);
          }}
          face={tagFace}
          onTagged={async () => {
            setTagFaceId(null);
            await queryClient.invalidateQueries({ queryKey: ["immich", "assetFaces", asset.id] });
            await queryClient.invalidateQueries({ queryKey: ["immich", "listPeople"] });
            await onFaceTagged?.();
          }}
        />
      )}
    </>
  );
}
