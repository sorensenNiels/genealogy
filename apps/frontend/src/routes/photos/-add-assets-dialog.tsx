import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addImmichAlbumAssets,
  getEligibleVirtualAlbumAssets,
} from "../../server/functions/immich.functions";

const PAGE_SIZE = 30;

/**
 * A virtual album only ever grows by referencing photos that already belong
 * to a physical album (see `-album-kind.ts`/`ImmichService.addAssetsToAlbum`)
 * — this dialog is that picker, never rendered for a physical album. Grouped
 * by source physical album, mirroring the idea that a virtual album is a
 * curated view across several real, scanned albums.
 */
export function AddAssetsDialog({
  albumId,
  onAdded,
}: {
  albumId: string;
  onAdded: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <FormDialog
      trigger={<Button variant="outline">{t("addAssets.addExistingPhotos")}</Button>}
      title={t("addAssets.addPhotosToAlbum")}
    >
      {(close) => (
        <AddAssetsForm
          albumId={albumId}
          onDone={async () => {
            close();
            await onAdded();
          }}
        />
      )}
    </FormDialog>
  );
}

function AddAssetsForm({ albumId, onDone }: { albumId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const assetsQuery = useInfiniteQuery({
    queryKey: ["immich", "eligibleVirtualAlbumAssets"],
    queryFn: ({ pageParam }) =>
      getEligibleVirtualAlbumAssets({
        data: { size: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const candidates = assetsQuery.data?.pages.flatMap((page) => page.assets) ?? [];

  const groups = new Map<string, { albumName: string; candidates: typeof candidates }>();
  for (const candidate of candidates) {
    for (const source of candidate.sourceAlbums) {
      const group = groups.get(source.albumId) ?? { albumName: source.albumName, candidates: [] };
      group.candidates.push(candidate);
      groups.set(source.albumId, group);
    }
  }

  const addAssetsMutation = useMutation({ mutationFn: addImmichAlbumAssets });

  const toggle = (assetId: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const submit = async (): Promise<void> => {
    await addAssetsMutation.mutateAsync({
      data: { albumId, assetIds: [...selected] },
    });
    await queryClient.invalidateQueries({ queryKey: ["immich", "albumAssets", albumId] });
    await onDone();
  };

  return (
    <div className="space-y-3">
      {assetsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">{t("addAssets.loadingPhotos")}</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("addAssets.noEligiblePhotos")}</p>
      ) : (
        <div className="max-h-96 space-y-4 overflow-auto">
          {[...groups.entries()].map(([sourceAlbumId, group]) => (
            <div key={sourceAlbumId} className="space-y-2">
              <h4 className="text-sm font-medium">{group.albumName}</h4>
              <div className="grid grid-cols-4 gap-2">
                {group.candidates.map(({ asset }) => {
                  const isSelected = selected.has(asset.id);
                  return (
                    <Button
                      key={asset.id}
                      variant="ghost"
                      onClick={() => toggle(asset.id)}
                      aria-pressed={isSelected}
                      aria-label={asset.originalFileName}
                      className="relative aspect-square h-auto w-full overflow-hidden rounded-md bg-muted p-0"
                    >
                      <img
                        src={`/api/immich/assets/${asset.id}/thumbnail`}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {isSelected && (
                        <span className="absolute inset-0 flex items-center justify-center bg-primary/40">
                          <CheckIcon
                            className="size-6 text-primary-foreground"
                            aria-hidden="true"
                          />
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {assetsQuery.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={assetsQuery.isFetchingNextPage}
          onClick={() => void assetsQuery.fetchNextPage()}
        >
          {assetsQuery.isFetchingNextPage ? t("addAssets.loading") : t("addAssets.loadMore")}
        </Button>
      )}

      {addAssetsMutation.isError && (
        <p className="text-sm text-destructive">{addAssetsMutation.error.message}</p>
      )}

      <DialogFooter>
        <Button
          disabled={selected.size === 0 || addAssetsMutation.isPending}
          onClick={() => void submit()}
        >
          {addAssetsMutation.isPending
            ? t("addAssets.adding")
            : t("addAssets.addPhotos", { count: selected.size })}
        </Button>
      </DialogFooter>
    </div>
  );
}
