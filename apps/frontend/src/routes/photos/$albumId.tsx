import { Button } from "@genealogy/ui/components/button";
import { PhotoGrid, type Selection } from "@genealogy/ui/components/photo-grid";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { Switch } from "@genealogy/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import {
  deleteImmichAlbum,
  deleteImmichAssets,
  enqueueAlbumZip,
  getImmichAlbum,
  getImmichAssetDetails,
  listAlbumAssets,
  removeImmichAlbumAssets,
  reorderImmichAlbumAssets,
  updateImmichAlbum,
} from "../../server/functions/immich.functions";
import { AddAssetsDialog } from "./-add-assets-dialog";
import { AssetViewer } from "./-asset-viewer";
import { UploadDialog } from "./-upload-dialog";

export const Route = createFileRoute("/photos/$albumId")({
  component: AlbumRoute,
});

function AlbumRoute() {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const { albumId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [checkCaptions, setCheckCaptions] = useState(false);
  const [missingCaptionOnly, setMissingCaptionOnly] = useState(false);
  // Optimistic overrides so captioning a photo drops it out of the "missing
  // caption" set immediately, without waiting on/triggering a batch refetch
  // (a batch check is an explicit, opt-in action — see the toggle below).
  const [captionOverrides, setCaptionOverrides] = useState<Record<string, string>>({});

  const album = useQuery({
    queryKey: ["immich", "album", albumId],
    queryFn: () => getImmichAlbum({ data: { albumId } }),
  });

  const assets = useQuery({
    queryKey: ["immich", "albumAssets", albumId],
    // Already in this app's own manual order where one is recorded — see
    // `ImmichService.orderedAlbumAssets`. New arrivals sort to the end until
    // dragged elsewhere.
    queryFn: () => listAlbumAssets({ data: { albumId } }),
  });

  const assetIds = assets.data?.map((asset) => asset.id) ?? [];
  // A full `GET /assets/{id}` per photo — real cost for a large album, so
  // only fetched once the toggle below is explicitly turned on, never just
  // from opening the album (see TECH_STACK.md's "Photos & albums: Immich").
  const detailsQuery = useQuery({
    queryKey: ["immich", "assetDetails", albumId],
    queryFn: () => getImmichAssetDetails({ data: { assetIds } }),
    enabled: checkCaptions && assetIds.length > 0,
  });

  const captionFor = (assetId: string): string =>
    captionOverrides[assetId] ?? detailsQuery.data?.[assetId]?.description ?? "";
  const missingCaptionIds =
    checkCaptions && detailsQuery.data
      ? new Set(assetIds.filter((id) => captionFor(id).trim() === ""))
      : null;
  const missingCaptionAssets =
    missingCaptionIds && assets.data
      ? assets.data.filter((asset) => missingCaptionIds.has(asset.id))
      : [];

  // Queued (BullMQ), not a synchronous fetch-and-blob-download — the zip is
  // generated in the background and a notification links to it once ready,
  // the same shape as the Tools page's "Backup database".
  const downloadAlbumMutation = useMutation({ mutationFn: enqueueAlbumZip });
  const deleteAlbumMutation = useMutation({ mutationFn: deleteImmichAlbum });
  const reorderMutation = useMutation({ mutationFn: reorderImmichAlbumAssets });
  const removeSelectedMutation = useMutation({ mutationFn: removeImmichAlbumAssets });
  const deleteSelectedMutation = useMutation({ mutationFn: deleteImmichAssets });
  const setCoverMutation = useMutation({ mutationFn: updateImmichAlbum });

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["immich", "album", albumId] }),
      queryClient.invalidateQueries({ queryKey: ["immich", "albumAssets", albumId] }),
      queryClient.invalidateQueries({ queryKey: ["immich", "listAlbums"] }),
    ]);
  };

  const deleteAlbum = async (): Promise<void> => {
    await deleteAlbumMutation.mutateAsync({ data: { albumId } });
    await queryClient.invalidateQueries({ queryKey: ["immich", "listAlbums"] });
    await navigate({ to: "/photos" });
  };

  const clearSelection = (): void => setSelectedKeys(new Set());

  const selectedIds =
    selectedKeys === "all"
      ? (assets.data?.map((asset) => asset.id) ?? [])
      : [...selectedKeys].map(String);

  const removeSelected = async (): Promise<void> => {
    await removeSelectedMutation.mutateAsync({ data: { albumId, assetIds: selectedIds } });
    clearSelection();
    await refresh();
  };

  const deleteSelected = async (): Promise<void> => {
    await deleteSelectedMutation.mutateAsync({ data: { assetIds: selectedIds } });
    clearSelection();
    await refresh();
  };

  const setSelectedAsCover = async (): Promise<void> => {
    const [assetId] = selectedIds;
    if (!assetId) return;
    await setCoverMutation.mutateAsync({ data: { albumId, albumThumbnailAssetId: assetId } });
    clearSelection();
    await refresh();
  };

  // A starting suggestion for a photo's caption, from the album's own
  // date/place (already set via the album edit dialog) — never pre-filled
  // as a real value, just what the caption field shows when it's empty.
  const captionPlaceholder =
    [album.data?.place, formatDisplayDate(album.data?.date, language)].filter(Boolean).join(", ") ||
    undefined;

  const gridItems =
    missingCaptionOnly && missingCaptionIds
      ? (assets.data?.filter((asset) => missingCaptionIds.has(asset.id)) ?? [])
      : (assets.data ?? []);
  // The viewer always steps through whatever's currently displayed — the
  // full album, the "missing caption only" filtered view, or (once "Review
  // captions" is pressed) just the uncaptioned subset regardless of the
  // grid's own filter toggle.
  const viewerAssets = reviewMode ? missingCaptionAssets : gridItems;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link to="/photos" className="text-sm text-muted-foreground hover:text-foreground">
          {t("albumPage.backToPhotos")}
        </Link>
        <h1 className="text-2xl font-semibold">
          {album.data?.albumName ?? t("albumPage.albumFallback")}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <UploadDialog
          albumId={albumId}
          trigger={<Button variant="outline">{t("albumPage.uploadToAlbum")}</Button>}
          onUploaded={refresh}
        />
        <AddAssetsDialog albumId={albumId} onAdded={refresh} />
        <Button
          type="button"
          variant="outline"
          isDisabled={downloadAlbumMutation.isPending}
          onPress={() => downloadAlbumMutation.mutate({ data: { albumId } })}
        >
          {downloadAlbumMutation.isPending ? t("tools.queuing") : t("albumPage.downloadAll")}
        </Button>
        <RemoveButton
          itemLabel={t("albumPage.thisAlbum")}
          title={t("albumPage.deleteAlbumTitle")}
          description={t("albumPage.deleteAlbumDescription")}
          actionLabel={t("common.delete")}
          trigger={
            <Button type="button" variant="destructive" size="sm" className="ml-auto">
              {t("albumPage.deleteAlbum")}
            </Button>
          }
          onConfirm={() => void deleteAlbum()}
        />
      </div>

      {downloadAlbumMutation.isError && (
        <p className="text-sm text-destructive">
          {downloadAlbumMutation.error instanceof Error
            ? downloadAlbumMutation.error.message
            : t("tools.couldNotQueueDownload")}
        </p>
      )}
      {downloadAlbumMutation.isSuccess && (
        <p className="text-sm text-muted-foreground">{t("albumPage.downloadQueued")}</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Switch isSelected={checkCaptions} onChange={setCheckCaptions}>
          {t("albumPage.checkCaptions")}
        </Switch>
        {checkCaptions && detailsQuery.isPending && (
          <p className="text-sm text-muted-foreground">{t("tools.checking")}</p>
        )}
        {checkCaptions && missingCaptionIds && (
          <>
            <Switch isSelected={missingCaptionOnly} onChange={setMissingCaptionOnly}>
              {t("albumPage.missingCaptionOnly", { count: missingCaptionAssets.length })}
            </Switch>
            {missingCaptionAssets.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onPress={() => {
                  setReviewMode(true);
                  setOpenIndex(0);
                }}
              >
                {t("albumPage.reviewCaptions")}
              </Button>
            )}
          </>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t("albumPage.selectedCount", { count: selectedIds.length })}
          </p>
          <div className="ml-auto flex gap-2">
            {selectedIds.length === 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onPress={() => void setSelectedAsCover()}
              >
                {t("albumPage.setAsCover")}
              </Button>
            )}
            <RemoveButton
              itemLabel={t("albumPage.selectedFromAlbum")}
              title={t("albumPage.removePhotosTitle", { count: selectedIds.length })}
              description={t("albumPage.removePhotosDescription")}
              actionLabel={t("common.remove")}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  {t("albumPage.removeFromAlbum")}
                </Button>
              }
              onConfirm={() => void removeSelected()}
            />
            <RemoveButton
              itemLabel={t("albumPage.selectedPhotos")}
              title={t("albumPage.deletePhotosTitle", { count: selectedIds.length })}
              description={t("albumPage.deletePhotosDescription")}
              actionLabel={t("common.delete")}
              trigger={
                <Button type="button" variant="destructive" size="sm">
                  {t("albumPage.deletePhotos")}
                </Button>
              }
              onConfirm={() => void deleteSelected()}
            />
            <Button type="button" variant="ghost" size="sm" onPress={clearSelection}>
              {t("common.clear")}
            </Button>
          </div>
        </div>
      )}

      {assets.isPending ? (
        <p className="text-sm text-muted-foreground">{t("person.photos.loadingPhotos")}</p>
      ) : assets.isError ? (
        <p className="text-sm text-destructive">
          {t("albumPage.loadErrorPhotos", { message: assets.error.message })}
        </p>
      ) : assets.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("albumPage.noPhotosInAlbum")}</p>
      ) : (
        <>
          <PhotoGrid
            aria-label={t("albumPage.photosInAlbum", {
              name: album.data?.albumName ?? t("albumPage.thisAlbum"),
            })}
            className="grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
            items={gridItems}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            onItemAction={(id) => {
              const index = gridItems.findIndex((asset) => asset.id === id);
              if (index !== -1) {
                setReviewMode(false);
                setOpenIndex(index);
              }
            }}
            onReorder={(orderedIds) => {
              reorderMutation.mutate(
                { data: { albumId, assetIds: orderedIds } },
                {
                  onSuccess: () => {
                    void queryClient.invalidateQueries({
                      queryKey: ["immich", "albumAssets", albumId],
                    });
                  },
                },
              );
            }}
          >
            {(asset) => (
              <>
                <img
                  src={`/api/immich/assets/${asset.id}/thumbnail`}
                  alt={asset.originalFileName}
                  loading="lazy"
                  className="size-full object-cover"
                />
                {checkCaptions && missingCaptionIds?.has(asset.id) && (
                  <span
                    aria-label={t("albumPage.missingCaption")}
                    className="absolute top-1 right-1 size-2.5 rounded-full bg-destructive"
                  />
                )}
              </>
            )}
          </PhotoGrid>
          <AssetViewer
            assets={viewerAssets}
            index={openIndex}
            onIndexChange={setOpenIndex}
            onClose={() => {
              setOpenIndex(null);
              setReviewMode(false);
            }}
            albumId={albumId}
            onAssetRemoved={refresh}
            {...(captionPlaceholder ? { captionPlaceholder } : {})}
            onCaptionSaved={(assetId, description) => {
              setCaptionOverrides((prev) => ({ ...prev, [assetId]: description }));
            }}
          />
        </>
      )}
    </div>
  );
}
