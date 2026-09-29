import { resolveHistoricalDate } from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SectionCard } from "@genealogy/ui/components/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { Switch } from "@genealogy/ui/components/switch";
import { TagInput } from "@genealogy/ui/components/tag-input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate, historicalDatePreview } from "../../lib/format-date";
import {
  isImmichConfigured,
  listImmichAlbumTags,
  listImmichAlbums,
} from "../../server/functions/immich.functions";
import { EditAlbumDialog } from "./-edit-album-dialog";
import { NewAlbumDialog } from "./-new-album-dialog";

type AlbumSort = "name" | "date" | "assetCount";

export const Route = createFileRoute("/photos/")({
  component: PhotosPage,
});

function PhotosPage() {
  const { t } = useTranslation();
  const configured = useQuery({
    queryKey: ["immich", "isConfigured"],
    queryFn: () => isImmichConfigured(),
  });
  // Unfiltered, separate from AlbumGrid's own (possibly filtered) query —
  // this is a library-wide stat for the subtitle, not a live filtered count.
  const albums = useQuery({
    queryKey: ["immich", "listAlbums", {}],
    queryFn: () => listImmichAlbums({ data: {} }),
    enabled: configured.data === true,
  });
  const albumCount = albums.data?.length;
  const photoCount = albums.data?.reduce((total, album) => total + album.assetCount, 0);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("photosPage.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {albumCount !== undefined && photoCount !== undefined
            ? `${t("photosPage.albumCount", { count: albumCount })}, ${t("photosPage.photoCount", { count: photoCount })}`
            : t("photosPage.loading")}
        </p>
      </div>

      {configured.isPending ? (
        <p className="text-sm text-muted-foreground">{t("photosPage.loading")}</p>
      ) : configured.data ? (
        <>
          <PhotosToolbar />
          <AlbumGrid />
        </>
      ) : (
        <NotConfigured />
      )}
    </div>
  );
}

function PhotosToolbar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const refreshAlbums = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["immich", "listAlbums"] });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <NewAlbumDialog
        onCreated={async (albumId) => {
          await refreshAlbums();
          await navigate({ to: "/photos/$albumId", params: { albumId } });
        }}
      />
    </div>
  );
}

function NotConfigured() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <ImageIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("photosPage.notConfiguredPrefix")}{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          docker compose --profile immich up -d
        </code>
        {t("photosPage.notConfiguredMiddle")}{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">IMMICH_URL</code>/
        <code className="rounded bg-muted px-1 py-0.5 text-xs">IMMICH_API_KEY</code>{" "}
        {t("photosPage.notConfiguredSuffix")}
      </p>
    </div>
  );
}

function AlbumGrid() {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [place, setPlace] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [missingInfo, setMissingInfo] = useState(false);
  const [sort, setSort] = useState<AlbumSort>("name");

  const filterInput = {
    ...(search.trim() !== "" ? { search: search.trim() } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(place.trim() !== "" ? { place: place.trim() } : {}),
    ...(dateFrom.trim() !== ""
      ? { dateFrom: resolveHistoricalDate(dateFrom, language).earliest ?? undefined }
      : {}),
    ...(dateTo.trim() !== ""
      ? { dateTo: resolveHistoricalDate(dateTo, language).latest ?? undefined }
      : {}),
    ...(missingInfo ? { missingInfo } : {}),
    sort,
  };

  const tagsQuery = useQuery({
    queryKey: ["immich", "albumTags"],
    queryFn: () => listImmichAlbumTags(),
  });
  const albums = useQuery({
    queryKey: ["immich", "listAlbums", filterInput],
    queryFn: () => listImmichAlbums({ data: filterInput }),
  });

  const refreshAlbums = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["immich", "listAlbums"] });
    await queryClient.invalidateQueries({ queryKey: ["immich", "albumTags"] });
  };

  const resetFilters = () => {
    setSearch("");
    setTags([]);
    setPlace("");
    setDateFrom("");
    setDateTo("");
    setMissingInfo(false);
  };

  return (
    <section className="space-y-3">
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <SectionCard
          className="h-fit"
          title={t("photosPage.filters")}
          titleClassName="text-base"
          contentClassName="space-y-4"
          action={
            <Button type="button" variant="ghost" size="sm" onPress={resetFilters}>
              {t("photosPage.reset")}
            </Button>
          }
        >
          <LabeledField label={t("photosPage.name")} asDiv>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={t("photosPage.filterByAlbumName")}
            />
          </LabeledField>

          <LabeledField label={t("photosPage.tagsAnyMatch")} asDiv>
            <TagInput value={tags} onChange={setTags} suggestions={tagsQuery.data ?? []} />
          </LabeledField>

          <LabeledField label={t("photosPage.place")} asDiv>
            <Input
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              aria-label={t("photosPage.filterByPlace")}
            />
          </LabeledField>

          <LabeledField label={t("photosPage.dateAfter")} asDiv>
            <HistoricalDateInput
              aria-label={t("photosPage.dateAfter")}
              value={dateFrom}
              onChange={setDateFrom}
              preview={historicalDatePreview(dateFrom, language)}
            />
          </LabeledField>

          <LabeledField label={t("photosPage.dateBefore")} asDiv>
            <HistoricalDateInput
              aria-label={t("photosPage.dateBefore")}
              value={dateTo}
              onChange={setDateTo}
              preview={historicalDatePreview(dateTo, language)}
            />
          </LabeledField>

          <Switch isSelected={missingInfo} onChange={setMissingInfo}>
            {t("photosPage.missingInfo")}
          </Switch>

          <LabeledField label={t("photosPage.sortBy")} asDiv>
            <Select
              aria-label={t("photosPage.sortAlbumsBy")}
              selectedKey={sort}
              onSelectionChange={(key) => {
                if (key) setSort(key as AlbumSort);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="name">{t("photosPage.sortName")}</SelectItem>
                <SelectItem id="date">{t("photosPage.sortDate")}</SelectItem>
                <SelectItem id="assetCount">{t("photosPage.sortPhotoCount")}</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
        </SectionCard>

        {albums.isPending ? (
          <p className="text-sm text-muted-foreground">{t("photosPage.loadingAlbums")}</p>
        ) : albums.isError ? (
          <p className="text-sm text-destructive">
            {t("photosPage.loadErrorAlbums", { message: albums.error.message })}
          </p>
        ) : albums.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("photosPage.noMatchingAlbums")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {albums.data.map((album) => (
              <Card
                key={album.id}
                className="relative overflow-hidden py-0 transition-colors hover:border-foreground/30"
              >
                <Link to="/photos/$albumId" params={{ albumId: album.id }} className="block">
                  <div className="aspect-square bg-muted">
                    {album.albumThumbnailAssetId && (
                      <img
                        src={`/api/immich/assets/${album.albumThumbnailAssetId}/thumbnail`}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <CardContent className="space-y-1 px-3 py-3 pr-9">
                    <p className="truncate text-sm font-medium">{album.albumName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("photosPage.photoCount", { count: album.assetCount })}
                      {album.place ? ` · ${album.place}` : ""}
                      {formatDisplayDate(album.date, language)
                        ? ` · ${formatDisplayDate(album.date, language)}`
                        : ""}
                    </p>
                    {album.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {album.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Link>
                <EditAlbumDialog
                  album={album}
                  onSaved={refreshAlbums}
                  className="absolute right-2 bottom-2"
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
