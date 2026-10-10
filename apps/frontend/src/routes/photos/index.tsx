import { paginate, resolveHistoricalDate, type AlbumKind } from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { PhotoBook, type PhotoBookPage } from "@genealogy/ui/components/photo-book";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Select } from "@genealogy/ui/components/select";
import { Switch } from "@genealogy/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@genealogy/ui/components/table";
import { useViewMode } from "@genealogy/ui/hooks/use-view-mode";
import { ReadOnlyProvider } from "@genealogy/ui/lib/read-only";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LayoutGridIcon, ListIcon, BookOpenIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate, historicalDatePreview } from "../../lib/format-date";
import { useImmichAvailable } from "../../lib/immich-status";
import { usePermissions } from "../../lib/permissions";
import {
  getSourceAlbumsForAssets,
  listAlbumAssets,
  listImmichAlbums,
} from "../../server/functions/immich.functions";
import {
  CategoriesPanel,
  CategoryDot,
  useAlbumCategories,
  type AlbumCategorySelection,
} from "./-album-categories";
import { AlbumCover } from "./-album-cover";
import { EditAlbumDialog, type AlbumWithMetadata } from "./-edit-album-dialog";
import { RequireImmich } from "./-immich-unavailable";
import { NewAlbumDialog } from "./-new-album-dialog";

type AlbumSort = "name" | "date" | "assetCount";
type PhotosViewMode = "list" | "grid" | "book";
const VIEW_MODES: readonly PhotosViewMode[] = ["list", "grid", "book"];
type AlbumRow = AlbumWithMetadata;

export const Route = createFileRoute("/photos/")({
  component: PhotosPage,
});

function PhotosPage() {
  const { t } = useTranslation();
  const immichAvailable = useImmichAvailable();
  // Unfiltered, separate from AlbumsSection's own (possibly filtered) query —
  // this is a library-wide stat for the subtitle, not a live filtered count.
  const albums = useQuery({
    queryKey: ["immich", "listAlbums", {}],
    queryFn: () => listImmichAlbums({ data: {} }),
    enabled: immichAvailable,
  });
  const albumCount = albums.data?.length;
  const photoCount = albums.data?.reduce((total, album) => total + album.assetCount, 0);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("photosPage.title")}</h1>
        {immichAvailable && (
          <p className="text-sm text-muted-foreground">
            {albumCount !== undefined && photoCount !== undefined
              ? `${t("photosPage.albumCount", { count: albumCount })}, ${t("photosPage.photoCount", { count: photoCount })}`
              : t("photosPage.loading")}
          </p>
        )}
      </div>

      <RequireImmich>
        <AlbumsSection />
      </RequireImmich>
    </div>
  );
}

function kindLabel(t: (key: string) => string, kind: AlbumKind): string {
  return kind === "physical" ? t("album.kindPhysical") : t("album.kindVirtual");
}

function AlbumsSection() {
  const { t, i18n } = useTranslation();
  const { canEdit } = usePermissions();
  const language = toSupportedLanguage(i18n.language);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useViewMode<PhotosViewMode>(
    "photos-view-mode",
    VIEW_MODES,
    "grid",
  );
  const [search, setSearch] = useState("");
  const [place, setPlace] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [missingInfo, setMissingInfo] = useState(false);
  const [sort, setSort] = useState<AlbumSort>("name");
  const [kindFilter, setKindFilter] = useState<AlbumKind | "all">("all");
  const [bookAlbumId, setBookAlbumId] = useState<string | null>(null);
  const [categorySelection, setCategorySelection] = useState<AlbumCategorySelection>("all");

  const filterInput = {
    ...(search.trim() !== "" ? { search: search.trim() } : {}),
    ...(place.trim() !== "" ? { place: place.trim() } : {}),
    ...(dateFrom.trim() !== ""
      ? { dateFrom: resolveHistoricalDate(dateFrom, language).earliest ?? undefined }
      : {}),
    ...(dateTo.trim() !== ""
      ? { dateTo: resolveHistoricalDate(dateTo, language).latest ?? undefined }
      : {}),
    ...(missingInfo ? { missingInfo } : {}),
    ...(kindFilter !== "all" ? { kind: kindFilter } : {}),
    sort,
  };

  const albums = useQuery({
    queryKey: ["immich", "listAlbums", filterInput],
    queryFn: () => listImmichAlbums({ data: filterInput }),
    // Keep the current albums on screen while a changed filter or sort loads.
    placeholderData: keepPreviousData,
  });

  const categories = useAlbumCategories();
  const categoryList = categories.data ?? [];
  // A category deleted elsewhere (another tab) falls back to "all" rather
  // than showing an empty, unexplained list.
  const selection: AlbumCategorySelection =
    categorySelection === "all" ||
    categorySelection === "uncategorised" ||
    categoryList.some((category) => category.id === categorySelection)
      ? categorySelection
      : "all";
  const albumGroups = groupAlbumsByCategory(
    albums.data ?? [],
    categoryList,
    selection,
    t("albumCategories.uncategorised"),
  );

  const refreshAlbums = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["immich", "listAlbums"] });
  };

  const resetFilters = () => {
    setSearch("");
    setPlace("");
    setDateFrom("");
    setDateTo("");
    setMissingInfo(false);
    setKindFilter("all");
  };

  const bookAlbum = albums.data?.find((album) => album.id === bookAlbumId) ?? null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <ButtonRadioGroup
          aria-label={t("photosPage.viewModeLabel")}
          value={viewMode}
          onValueChange={setViewMode}
          options={[
            {
              value: "list",
              label: (
                <span className="flex items-center" title={t("photosPage.viewList")}>
                  <ListIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">{t("photosPage.viewList")}</span>
                </span>
              ),
            },
            {
              value: "grid",
              label: (
                <span className="flex items-center" title={t("photosPage.viewGrid")}>
                  <LayoutGridIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">{t("photosPage.viewGrid")}</span>
                </span>
              ),
            },
            {
              value: "book",
              label: (
                <span className="flex items-center" title={t("photosPage.viewBook")}>
                  <BookOpenIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">{t("photosPage.viewBook")}</span>
                </span>
              ),
            },
          ]}
        />
        <NewAlbumDialog
          defaultCategoryIds={
            selection === "all" || selection === "uncategorised" ? [] : [selection]
          }
          onCreated={async (albumId) => {
            await refreshAlbums();
            await navigate({ to: "/photos/$albumId", params: { albumId } });
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-6">
          <ReadOnlyProvider readOnly={!canEdit}>
            <CategoriesPanel
              categories={categoryList}
              albums={albums.data ?? []}
              selected={selection}
              onSelect={setCategorySelection}
            />
          </ReadOnlyProvider>
          <SectionCard
            className="h-fit"
            title={t("photosPage.filters")}
            titleClassName="text-base"
            contentClassName="space-y-4"
            action={
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
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

            <LabeledField label={t("photosPage.kindFilterLabel")} asDiv>
              <ButtonRadioGroup
                aria-label={t("photosPage.kindFilterLabel")}
                value={kindFilter}
                onValueChange={setKindFilter}
                options={[
                  { value: "all", label: t("photosPage.kindFilterAll") },
                  { value: "physical", label: t("album.kindPhysical") },
                  { value: "virtual", label: t("album.kindVirtual") },
                ]}
              />
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

            <Switch checked={missingInfo} onCheckedChange={setMissingInfo}>
              {t("photosPage.missingInfo")}
            </Switch>

            <LabeledField label={t("photosPage.sortBy")} asDiv>
              <Select
                aria-label={t("photosPage.sortAlbumsBy")}
                value={sort}
                onValueChange={(key) => {
                  if (key) setSort(key as AlbumSort);
                }}
                options={[
                  { value: "name", label: t("photosPage.sortName") },
                  { value: "date", label: t("photosPage.sortDate") },
                  { value: "assetCount", label: t("photosPage.sortPhotoCount") },
                ]}
              />
            </LabeledField>
          </SectionCard>
        </div>

        {albums.isPending ? (
          <p className="text-sm text-muted-foreground">{t("photosPage.loadingAlbums")}</p>
        ) : albums.isError ? (
          <p className="text-sm text-destructive">
            {t("photosPage.loadErrorAlbums", { message: albums.error.message })}
          </p>
        ) : albumGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("photosPage.noMatchingAlbums")}</p>
        ) : (
          <div className="space-y-8">
            {albumGroups.map((group) => (
              <section key={group.key} className="space-y-3" aria-label={group.heading?.name}>
                {group.heading && (
                  <h2 className="flex items-center gap-2 border-b pb-1.5 text-sm font-semibold">
                    {group.heading.color && <CategoryDot color={group.heading.color} />}
                    <span className={group.heading.color ? undefined : "text-muted-foreground"}>
                      {group.heading.name}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {group.albums.length}
                    </span>
                  </h2>
                )}
                {viewMode === "list" ? (
                  <AlbumListView
                    albums={group.albums}
                    language={language}
                    onRefresh={refreshAlbums}
                  />
                ) : viewMode === "grid" ? (
                  <AlbumGridView
                    albums={group.albums}
                    language={language}
                    onRefresh={refreshAlbums}
                  />
                ) : (
                  <AlbumShelfView albums={group.albums} onOpen={setBookAlbumId} />
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {bookAlbum && (
        <AlbumBookLauncher
          album={bookAlbum}
          isOpen={bookAlbumId != null}
          onOpenChange={(open) => {
            if (!open) setBookAlbumId(null);
          }}
        />
      )}
    </section>
  );
}

interface AlbumGroup {
  key: string;
  /** Absent when there's nothing to group by — one plain, headingless list. */
  heading?: { name: string; color?: string };
  albums: AlbumRow[];
}

/**
 * On "all", one section per category that has albums (alphabetical, like
 * the sidebar), then "Uncategorised" — an album in two categories appears
 * in both, since it genuinely belongs to both. With no categories at all,
 * or with one category picked, it's a single headingless list, exactly as
 * before categories existed.
 */
function groupAlbumsByCategory(
  albums: AlbumRow[],
  categories: { id: string; name: string; color: string }[],
  selection: AlbumCategorySelection,
  uncategorisedLabel: string,
): AlbumGroup[] {
  const uncategorised = albums.filter((album) => album.categoryIds.length === 0);
  if (selection === "uncategorised") {
    return uncategorised.length > 0 ? [{ key: "uncategorised", albums: uncategorised }] : [];
  }
  if (selection !== "all") {
    const inCategory = albums.filter((album) => album.categoryIds.includes(selection));
    return inCategory.length > 0 ? [{ key: selection, albums: inCategory }] : [];
  }
  if (categories.length === 0) {
    return albums.length > 0 ? [{ key: "all", albums }] : [];
  }
  const groups: AlbumGroup[] = categories
    .map((category) => ({
      key: category.id,
      heading: { name: category.name, color: category.color },
      albums: albums.filter((album) => album.categoryIds.includes(category.id)),
    }))
    .filter((group) => group.albums.length > 0);
  if (uncategorised.length > 0) {
    groups.push({
      key: "uncategorised",
      heading: { name: uncategorisedLabel },
      albums: uncategorised,
    });
  }
  return groups;
}

function AlbumGridView({
  albums,
  language,
  onRefresh,
}: {
  albums: AlbumRow[];
  language: ReturnType<typeof toSupportedLanguage>;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {albums.map((album) => (
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
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{album.albumName}</p>
                <Badge variant={album.kind === "physical" ? "default" : "outline"}>
                  {kindLabel(t, album.kind)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("photosPage.photoCount", { count: album.assetCount })}
                {album.place ? ` · ${album.place}` : ""}
                {formatDisplayDate(album.date, language)
                  ? ` · ${formatDisplayDate(album.date, language)}`
                  : ""}
              </p>
            </CardContent>
          </Link>
          <EditAlbumDialog
            album={album}
            onSaved={onRefresh}
            className="absolute right-2 bottom-2"
          />
        </Card>
      ))}
    </div>
  );
}

function AlbumListView({
  albums,
  language,
  onRefresh,
}: {
  albums: AlbumRow[];
  language: ReturnType<typeof toSupportedLanguage>;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("photosPage.columnAlbum")}</TableHead>
            <TableHead>{t("photosPage.columnType")}</TableHead>
            <TableHead>{t("photosPage.columnDate")}</TableHead>
            <TableHead className="text-right">{t("photosPage.columnPhotos")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {albums.map((album) => (
            <TableRow key={album.id}>
              <TableCell>
                <Link
                  to="/photos/$albumId"
                  params={{ albumId: album.id }}
                  className="flex items-center gap-3"
                >
                  <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
                    {album.albumThumbnailAssetId && (
                      <img
                        src={`/api/immich/assets/${album.albumThumbnailAssetId}/thumbnail`}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <span className="truncate font-medium">{album.albumName}</span>
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={album.kind === "physical" ? "default" : "outline"}>
                  {kindLabel(t, album.kind)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDisplayDate(album.date, language) || "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{album.assetCount}</TableCell>
              <TableCell>
                <EditAlbumDialog album={album} onSaved={onRefresh} className="" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AlbumShelfView({
  albums,
  onOpen,
}: {
  albums: AlbumRow[];
  onOpen: (albumId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
      {albums.map((album) => (
        <button
          key={album.id}
          type="button"
          onClick={() => onOpen(album.id)}
          aria-label={t("photosPage.openAlbumAria", { name: album.albumName })}
          className="group flex flex-col items-center gap-2 text-center"
        >
          {/* The book itself lifts and tilts on hover/focus — the caption
              below stays put, the same "pick it up off the shelf" gesture
              the mockup this is modeled on uses. `before`/`after` add the
              page-edge stripe and the soft contact shadow a flat `<img>`-style
              thumbnail wouldn't have on its own. */}
          <div className="relative aspect-5/6 w-full max-w-40 shadow-md transition-transform duration-350 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:-translate-y-1.5 group-hover:-rotate-1 group-focus-visible:-translate-y-1.5 group-focus-visible:-rotate-1 before:absolute before:-right-1.5 before:-bottom-2 before:left-1 before:-z-20 before:h-2.5 before:rounded-full before:bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35),transparent_70%)] before:blur-[3px] before:content-[''] after:absolute after:top-1 after:-right-1.75 after:-bottom-1 after:-z-10 after:w-2 after:rounded-r-xs after:bg-[repeating-linear-gradient(90deg,#efe9dc_0_1px,#cfc6b4_1px_2px)] after:content-['']">
            <AlbumCover album={album} variant="spine" />
          </div>
          <p className="truncate text-sm font-medium">{album.albumName}</p>
        </button>
      ))}
    </div>
  );
}

/** Fetches a single album's photos on demand (not needed until its spine is actually clicked) and opens it in `PhotoBook`. */
function AlbumBookLauncher({
  album,
  isOpen,
  onOpenChange,
}: {
  album: AlbumRow;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const assets = useQuery({
    queryKey: ["immich", "albumAssets", album.id],
    queryFn: () => listAlbumAssets({ data: { albumId: album.id } }),
    enabled: isOpen,
  });
  const assetIds = assets.data?.map((asset) => asset.id) ?? [];
  const isVirtual = album.kind === "virtual";
  const sourceAlbumsQuery = useQuery({
    queryKey: ["immich", "sourceAlbumsForAssets", album.id],
    queryFn: () => getSourceAlbumsForAssets({ data: { assetIds } }),
    enabled: isOpen && isVirtual && assetIds.length > 0,
  });

  const pages: PhotoBookPage[] = paginate(assets.data ?? [], album.photosPerPage).map(
    (group, pageIndex) => ({
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
    }),
  );

  return (
    <PhotoBook
      open={isOpen}
      onOpenChange={onOpenChange}
      title={album.albumName}
      coverNode={<AlbumCover album={album} variant="spine" />}
      insideCoverNode={<AlbumCover album={album} variant="inside" />}
      pages={pages}
      paperStyle={isVirtual ? "modern" : "black"}
    />
  );
}
