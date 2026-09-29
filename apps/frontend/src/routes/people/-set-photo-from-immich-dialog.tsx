import { Button } from "@genealogy/ui/components/button";
import {
  ControlledDialogContent,
  DialogHeader,
  DialogTitle,
} from "@genealogy/ui/components/dialog";
import { ImageCropDialog } from "@genealogy/ui/components/image-crop-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsPanels,
  TabsTrigger,
} from "@genealogy/ui/components/tabs";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { listPersonPhotos, searchImmichAssets } from "../../server/functions/immich.functions";

const PAGE_SIZE = 30;

/**
 * "Choose from Immich" for a person's profile photo — pick any existing
 * photo (not just one already face-linked to this person, per the user's
 * own ask), then crop a circular region of it. Two steps, two dialogs
 * (never both open at once, switched on `selectedAssetId`): a picker grid
 * here, then `ImageCropDialog` (`packages/ui`) once something's picked.
 *
 * The crop's output is uploaded through the exact same
 * `/api/people/$id/photo` proxy route the plain local-file upload already
 * uses (see `PersonPhoto` in `-person-header-card.tsx`) — a cropped Blob is
 * just another image file as far as that endpoint is concerned, so no
 * backend change was needed for this feature at all.
 */
export function SetPhotoFromImmichDialog({
  personId,
  isOpen,
  onOpenChange,
  onSaved,
}: {
  personId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    onOpenChange(false);
    setSelectedAssetId(null);
    setError(null);
  };

  const handleCropped = async (blob: Blob): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "cropped.jpg");
      const response = await fetch(`/api/people/${personId}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Photo upload failed: ${response.status}`);
      }
      await onSaved();
      close();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("person.chooseFromImmichDialog.couldNotSave"),
      );
      setIsSaving(false);
    }
  };

  if (selectedAssetId) {
    return (
      <ImageCropDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        imageSrc={`/api/immich/assets/${selectedAssetId}/preview`}
        onBack={() => setSelectedAssetId(null)}
        isSaving={isSaving}
        onCropped={(blob) => void handleCropped(blob)}
      />
    );
  }

  return (
    <ControlledDialogContent
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("person.chooseFromImmichDialog.title")}</DialogTitle>
      </DialogHeader>
      <Tabs defaultSelectedKey="mine">
        <TabsList aria-label={t("person.chooseFromImmichDialog.photoSource")}>
          <TabsTrigger id="mine">
            {t("person.chooseFromImmichDialog.thisPersonsPhotos")}
          </TabsTrigger>
          <TabsTrigger id="all">{t("person.chooseFromImmichDialog.allPhotos")}</TabsTrigger>
        </TabsList>
        <TabsPanels>
          <TabsContent id="mine">
            <PersonPhotosPicker personId={personId} onPick={setSelectedAssetId} />
          </TabsContent>
          <TabsContent id="all">
            <AllPhotosPicker onPick={setSelectedAssetId} />
          </TabsContent>
        </TabsPanels>
      </Tabs>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </ControlledDialogContent>
  );
}

function PhotoGridButton({
  assetId,
  onPick,
}: {
  assetId: string;
  onPick: (assetId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      onPress={() => onPick(assetId)}
      aria-label={t("person.chooseFromImmichDialog.choosePhoto")}
      className="aspect-square h-auto w-full overflow-hidden rounded-md bg-muted p-0"
    >
      <img
        src={`/api/immich/assets/${assetId}/thumbnail`}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
    </Button>
  );
}

function PersonPhotosPicker({
  personId,
  onPick,
}: {
  personId: string;
  onPick: (assetId: string) => void;
}) {
  const { t } = useTranslation();
  const photos = useQuery({
    queryKey: ["immich", "photos", personId],
    queryFn: () => listPersonPhotos({ data: { personId } }),
  });

  if (photos.isPending) {
    return <p className="mt-3 text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!photos.data || photos.data.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        {t("person.chooseFromImmichDialog.noPersonPhotos")}
      </p>
    );
  }
  return (
    <div className="mt-3 grid max-h-96 grid-cols-4 gap-2 overflow-auto">
      {photos.data.map((asset) => (
        <PhotoGridButton key={asset.id} assetId={asset.id} onPick={onPick} />
      ))}
    </div>
  );
}

function AllPhotosPicker({ onPick }: { onPick: (assetId: string) => void }) {
  const { t } = useTranslation();
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

  return (
    <div className="mt-3 space-y-3">
      {assetsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("person.chooseFromImmichDialog.noLibraryPhotos")}
        </p>
      ) : (
        <div className="grid max-h-96 grid-cols-4 gap-2 overflow-auto">
          {assets.map((asset) => (
            <PhotoGridButton key={asset.id} assetId={asset.id} onPick={onPick} />
          ))}
        </div>
      )}
      {assetsQuery.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          isDisabled={assetsQuery.isFetchingNextPage}
          onPress={() => void assetsQuery.fetchNextPage()}
        >
          {assetsQuery.isFetchingNextPage
            ? t("common.loading")
            : t("person.chooseFromImmichDialog.loadMore")}
        </Button>
      )}
    </div>
  );
}
