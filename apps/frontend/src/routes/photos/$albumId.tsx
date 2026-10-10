import { paginate } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { PhotoBook, type PhotoBookPage } from "@genealogy/ui/components/photo-book";
import { PhotoGrid, type Selection } from "@genealogy/ui/components/photo-grid";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { Switch } from "@genealogy/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { usePermissions } from "../../lib/permissions";
import {
  deleteImmichAlbum,
  deleteImmichAssets,
  enqueueAlbumZip,
  getImmichAlbum,
  getImmichAssetDetails,
  getSourceAlbumsForAssets,
  listAlbumAssets,
  removeImmichAlbumAssets,
  reorderImmichAlbumAssets,
  updateImmichAlbum,
} from "../../server/functions/immich.functions";
import { AddAssetsDialog } from "./-add-assets-dialog";
import { AlbumCover } from "./-album-cover";
import { albumActionsForKind } from "./-album-kind";
import { AssetViewer } from "./-asset-viewer";
import { RequireImmich } from "./-immich-unavailable";
import { UploadDialog } from "./-upload-dialog";

export const Route = createFileRoute("/photos/$albumId")({
  component: AlbumRoute,
});

function AlbumRoute() {
  return (
    <RequireImmich>
      <AlbumPage />
    </RequireImmich>
  );
}

function AlbumPage() {
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
  const [bookOpen, setBookOpen] = useState(false);
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

  const isVirtual = album.data?.kind === "virtual";
  const actions = albumActionsForKind(album.data?.kind ?? "physical");
  // Only fetched for a virtual album, and only once the book is actually
  // opened — a physical album's photos always come from itself, so there's
  // nothing to look up.
  const sourceAlbumsQuery = useQuery({
    queryKey: ["immich", "sourceAlbumsForAssets", albumId],
    queryFn: () => getSourceAlbumsForAssets({ data: { assetIds } }),
    enabled: bookOpen && isVirtual && assetIds.length > 0,
  });
  const bookPages: PhotoBookPage[] = album.data
    ? paginate(assets.data ?? [], album.data.photosPerPage).map((group, pageIndex) => ({
        id: `page-${pageIndex}`,
        photos: group.map((asset) => {
          const sources = sourceAlbumsQuery.data?.[asset.id];
          const sourceLabel = sources?.length
            ? sources.map((source) => `${source.albumName}, p. ${source.page}`).join(" · ")
            : undefined;
          return {
            id: asset.id,
            src: `/api/immich/assets/${asset.id}/thumbnail`,
            alt: asset.originalFileName,
            ...(sourceLabel ? { sourceLabel } : {}),
          };
        }),
      }))
    : [];
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
  const { canEdit, isAdmin } = usePermissions();
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
        {canEdit && actions.canUpload && (
          <UploadDialog
            albumId={albumId}
            trigger={<Button variant="outline">{t("albumPage.uploadToAlbum")}</Button>}
            onUploaded={refresh}
          />
        )}
        {canEdit && actions.canAddExisting && (
          <AddAssetsDialog albumId={albumId} onAdded={refresh} />
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!assets.data || assets.data.length === 0}
          onClick={() => setBookOpen(true)}
        >
          {t("albumPage.openAsBook")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={downloadAlbumMutation.isPending}
          onClick={() => downloadAlbumMutation.mutate({ data: { albumId } })}
        >
          {downloadAlbumMutation.isPending ? t("tools.queuing") : t("albumPage.downloadAll")}
        </Button>
        {isAdmin && (
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
        )}
      </div>

      {isVirtual && (
        <p className="text-sm text-muted-foreground">{t("albumPage.virtualAlbumNote")}</p>
      )}

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
        <Switch checked={checkCaptions} onCheckedChange={setCheckCaptions}>
          {t("albumPage.checkCaptions")}
        </Switch>
        {checkCaptions && detailsQuery.isPending && (
          <p className="text-sm text-muted-foreground">{t("tools.checking")}</p>
        )}
        {checkCaptions && missingCaptionIds && (
          <>
            <Switch checked={missingCaptionOnly} onCheckedChange={setMissingCaptionOnly}>
              {t("albumPage.missingCaptionOnly", { count: missingCaptionAssets.length })}
            </Switch>
            {missingCaptionAssets.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
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
            {canEdit && selectedIds.length === 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void setSelectedAsCover()}
              >
                {t("albumPage.setAsCover")}
              </Button>
            )}
            {canEdit && (
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
            )}
            {isAdmin && (
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
            )}
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
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
            // No drag handles at all for someone who can't reorder.
            {...(canEdit
              ? {
                  onReorder: (orderedIds: string[]) => {
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
                  },
                }
              : {})}
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

      {album.data && (
        <PhotoBook
          open={bookOpen}
          onOpenChange={setBookOpen}
          title={album.data.albumName}
          coverNode={<AlbumCover album={album.data} variant="spine" />}
          insideCoverNode={<AlbumCover album={album.data} variant="inside" />}
          pages={bookPages}
          // A dedicated per-album "paper" appearance isn't its own stored
          // field — physical albums use one consistent dark paper, virtual
          // albums the plainer "modern" style, matching the cover/collage
          // distinction `AlbumCover` already draws between the two kinds.
          paperStyle={isVirtual ? "modern" : "black"}
        />
      )}
    </div>
  );
}
