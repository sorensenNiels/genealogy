import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { addImmichAlbumAssets, searchImmichAssets } from "../../server/functions/immich.functions";

const PAGE_SIZE = 30;

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
    queryKey: ["immich", "searchAssets"],
    queryFn: ({ pageParam }) =>
      searchImmichAssets({
        data: { size: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const assets = assetsQuery.data?.pages.flatMap((page) => page.assets) ?? [];

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
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("addAssets.noLibraryPhotos")}</p>
      ) : (
        <div className="grid max-h-96 grid-cols-4 gap-2 overflow-auto">
          {assets.map((asset) => {
            const isSelected = selected.has(asset.id);
            return (
              <Button
                key={asset.id}
                variant="ghost"
                onPress={() => toggle(asset.id)}
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
                    <CheckIcon className="size-6 text-primary-foreground" aria-hidden="true" />
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      )}

      {assetsQuery.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          isDisabled={assetsQuery.isFetchingNextPage}
          onPress={() => void assetsQuery.fetchNextPage()}
        >
          {assetsQuery.isFetchingNextPage ? t("addAssets.loading") : t("addAssets.loadMore")}
        </Button>
      )}

      {addAssetsMutation.isError && (
        <p className="text-sm text-destructive">{addAssetsMutation.error.message}</p>
      )}

      <DialogFooter>
        <Button
          isDisabled={selected.size === 0 || addAssetsMutation.isPending}
          onPress={() => void submit()}
        >
          {addAssetsMutation.isPending
            ? t("addAssets.adding")
            : t("addAssets.addPhotos", { count: selected.size })}
        </Button>
      </DialogFooter>
    </div>
  );
}
