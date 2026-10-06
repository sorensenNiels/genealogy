import { readFile } from "node:fs/promises";

import type {
  AlbumCover,
  AlbumKind,
  CreateAlbumInput,
  CreateAlbumWithMetadataInput,
  EligibleVirtualAssetsInput,
  HistoricalDate,
  ListAlbumsInput,
  SearchAssetsInput,
  SetAssetTagsInput,
  TagFaceInput,
  UpdateAlbumInput,
  UpdateAlbumMetadataInput,
} from "@genealogy/core";
import { formatPersonName, parseHistoricalDate } from "@genealogy/core";
import {
  albumCategories,
  albumCategoryMembers,
  albumMetadata,
  immichAlbumAssetOrder,
  personImmichLinks,
  persons,
  type AlbumMetadataRow,
  type Database,
  type PersonImmichLinkRow,
} from "@genealogy/db";
import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { and, asc, eq, inArray } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";
import { NotificationService } from "../notification/notification.service.js";

export const IMMICH_FACE_SCAN_QUEUE = "immich-face-scan";
export const RESCAN_FACES_JOB = "rescan";

export interface RescanFacesJob {
  userId: string;
}

/** The handful of fields this app actually uses from Immich's `PersonResponseDto`. */
export interface ImmichPerson {
  id: string;
  name: string;
  isHidden: boolean;
}

/** The handful of fields this app actually uses from Immich's `AssetResponseDto`. */
export interface ImmichAsset {
  id: string;
  originalFileName: string;
  type: string;
  fileCreatedAt: string;
}

/** Immich's native tag object (`GET/PUT /api/tags`) — distinct from this app's own `album_metadata.tags`. */
export interface ImmichTag {
  id: string;
  name: string;
}

/**
 * The description/tags this app cares about, off Immich's *full* asset
 * response (`GET /assets/{id}`) — unlike `ImmichAsset` above, neither field
 * is present on the lighter `/search/metadata` listing every album/library
 * grid uses, so this is only ever fetched per-asset, on demand (opening the
 * viewer, or an explicit "Check captions" batch), never for a whole grid.
 */
export interface AssetDetail {
  description: string;
  tags: ImmichTag[];
}

/** The handful of fields this app actually uses from Immich's `AlbumResponseDto`. */
export interface ImmichAlbum {
  id: string;
  albumName: string;
  description: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
}

export interface LinkedImmichPerson extends ImmichPerson {
  /** `person_immich_links.id` — what `unlink` takes, not Immich's own id. */
  linkId: string;
}

/** Local metadata layered on an Immich album — see `albumMetadata` in `@genealogy/db`'s schema. */
export interface AlbumMetadata {
  date: HistoricalDate | null;
  place: string | null;
  kind: AlbumKind;
  cover: AlbumCover | null;
  found: string | null;
  scanned: string | null;
  photosPerPage: number;
  /** The `album_categories` this album is in — see `albumCategoryMembers` in the schema. */
  categoryIds: string[];
}

export type AlbumWithMetadata = ImmichAlbum & AlbumMetadata;

/**
 * One candidate for a virtual album's picker, grouped by the physical
 * album(s) it's already a member of — see
 * `ImmichService.physicalAlbumAssetMembership`.
 */
export interface EligibleVirtualAlbumAsset {
  asset: ImmichAsset;
  sourceAlbums: AssetSourceAlbum[];
}

/** Where a virtual album's photo actually lives — its source physical album, and the book-view page it falls on there (computed from that album's own `photosPerPage`, not stored anywhere). */
export interface AssetSourceAlbum {
  albumId: string;
  albumName: string;
  page: number;
}

const emptyAlbumMetadata: AlbumMetadata = {
  date: null,
  place: null,
  kind: "physical",
  cover: null,
  found: null,
  scanned: null,
  photosPerPage: 4,
  categoryIds: [],
};

/** `kind` is stored as plain `text` (see the column's own doc comment in `@genealogy/db`'s schema), so it's narrowed to `AlbumKind` here at the one place a row becomes this app's typed shape. */
function rowToAlbumMetadata(row: AlbumMetadataRow, categoryIds: string[]): AlbumMetadata {
  return {
    categoryIds,
    date: row.date,
    place: row.place,
    kind: row.kind as AlbumKind,
    cover: row.cover,
    found: row.found,
    scanned: row.scanned,
    photosPerPage: row.photosPerPage,
  };
}

/** Same re-derivation `person.service.ts`'s own `resolveDate` does — never trust a client-sent `earliest`/`latest`, only `original`. */
function resolveDate(date: HistoricalDate | null | undefined): HistoricalDate | null | undefined {
  if (date == null) return date;
  return { ...date, ...parseHistoricalDate(date.original) };
}

export interface ImmichBinary {
  buffer: Buffer;
  contentType: string;
}

/**
 * A detected face, normalised so callers never touch Immich's raw
 * `boundingBoxX1/Y1/X2/Y2` + `imageWidth/imageHeight` coordinates — `box`
 * fields are fractions of the image (0–1), ready for percentage-based CSS
 * positioning in `FaceBoxOverlay`.
 */
export interface ImmichFace {
  /** Asset-face id — what `tagFace`'s `PUT /faces/{personId}` body references. */
  id: string;
  box: { left: number; top: number; width: number; height: number };
  immichPerson: ImmichPerson | null;
  /** Non-null once this Immich person has a `person_immich_links` row. */
  linkedPerson: { personId: string; linkId: string } | null;
}

export interface UploadedImmichFile {
  /** Disk path from multer's `diskStorage` — see the controller's `@UseInterceptors`. Never buffered fully in this process beyond the one read in `uploadAsset`. */
  path: string;
  mimetype: string;
  originalname: string;
}

export interface UploadAssetResult {
  assetId: string;
  /** Immich matched an existing checksum — the upload is a no-op success, not an error. */
  isDuplicate: boolean;
}

/** Immich's raw `AssetFaceResponseDto` shape — kept private to this file; see `ImmichFace` for what callers actually get. */
interface RawImmichFace {
  id: string;
  imageWidth: number;
  imageHeight: number;
  boundingBoxX1: number;
  boundingBoxX2: number;
  boundingBoxY1: number;
  boundingBoxY2: number;
  person: ImmichPerson | null;
}

/**
 * Thin wrapper over Immich's REST API (native `fetch`, no client library —
 * see TECH_STACK.md's library-vetting rule; the surface used here is small
 * enough that owning it outright avoids a dependency on Immich's generated
 * SDK release cadence) plus the `person_immich_links` mapping table CRUD.
 * One service, like `PersonService`, rather than splitting the API client
 * from the mapping-table logic — they're small and tightly coupled.
 *
 * `IMMICH_URL`/`IMMICH_API_KEY` are optional app config (see env.ts):
 * Immich is opt-in infrastructure, so every public method here either checks
 * `isConfigured()` itself or is only ever called after the router already
 * has.
 */
@Injectable()
export class ImmichService {
  private readonly logger = new Logger(ImmichService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    @InjectQueue(IMMICH_FACE_SCAN_QUEUE) private readonly faceScanQueue: Queue<RescanFacesJob>,
    private readonly notifications: NotificationService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>("IMMICH_URL") && this.config.get<string>("IMMICH_API_KEY"),
    );
  }

  private requireConfig(): { url: string; apiKey: string } {
    const url = this.config.get<string>("IMMICH_URL");
    const apiKey = this.config.get<string>("IMMICH_API_KEY");
    if (!url || !apiKey) {
      throw new BadRequestException("Immich is not configured");
    }
    return { url, apiKey };
  }

  /**
   * Throws on a non-ok response, mapping 404 to `NotFoundException` (not
   * just `BadRequestException`) so callers like `getPerson` that only
   * expect to catch a 404 actually can — this used to only happen in
   * `requestBinary`, which meant a deleted/merged Immich person threw a
   * generic `BadRequestException` here instead of the `null` the "dangling
   * link fails open" behavior documented in TECH_STACK.md depends on.
   *
   * Includes the response body in the thrown message: reads mostly fail
   * for boring reasons (Immich down), but a write failing is almost always
   * actionable — 403 means the configured API key lacks a scope the write
   * needs (see the `IMMICH_API_KEY` comment in env.ts), 400 means a bad
   * request body — and a bare "403 Forbidden" gives no hint which.
   */
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { url, apiKey } = this.requireConfig();
    const response = await fetch(`${url}/api${path}`, {
      ...init,
      headers: { ...init.headers, "x-api-key": apiKey, accept: "application/json" },
    });
    if (response.status === 404) {
      throw new NotFoundException(`Immich request failed: 404 (${path})`);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BadRequestException(
        `Immich request failed: ${response.status} ${response.statusText} (${path})${body ? ` — ${body}` : ""}`,
      );
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  private async requestBinary(path: string): Promise<ImmichBinary> {
    const { url, apiKey } = this.requireConfig();
    const response = await fetch(`${url}/api${path}`, { headers: { "x-api-key": apiKey } });
    if (response.status === 404) {
      throw new NotFoundException(`Immich asset not found (${path})`);
    }
    if (!response.ok) {
      throw new BadRequestException(
        `Immich request failed: ${response.status} ${response.statusText} (${path})`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType: response.headers.get("content-type") ?? "image/jpeg" };
  }

  /**
   * Every Immich "Person" (a face cluster), paginated — named or not; most
   * start unnamed. `withHidden=true`: a person Immich auto-hides (e.g. a
   * low-confidence or since-merged cluster) is still a real cluster this
   * app's own pickers (`ImmichPersonPicker`) should be able to link against
   * — excluding it silently was one of two confirmed causes of "the Link a
   * face picker doesn't show everyone."
   */
  async listPeople(
    page: number,
    size: number,
  ): Promise<{ people: ImmichPerson[]; total: number; hasNextPage: boolean }> {
    const result = await this.request<{
      people: ImmichPerson[];
      total: number;
      hasNextPage: boolean;
    }>(`/people?page=${page}&size=${size}&withHidden=true`);
    return result;
  }

  private async getPerson(immichPersonId: string): Promise<ImmichPerson | null> {
    try {
      return await this.request<ImmichPerson>(`/people/${immichPersonId}`);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      // Confirmed live (not assumed from the OpenAPI spec): Immich's actual
      // `GET /people/{id}` returns **400**, not 404, for a person id that
      // doesn't exist — "Not found or no person.read access" is its literal
      // message, conflating "doesn't exist" with "no permission" into one
      // status. This app's own API key has full access (see
      // TECH_STACK.md), so a genuine permission denial here doesn't happen
      // in practice — treat this message as the missing-person case the
      // "dangling link fails open" design already expects from a 404.
      // Without this, every dangling-link caller (a person's Photos card,
      // `listDanglingLinks`, ...) threw a raw 500 instead of degrading
      // gracefully — this surfaced live while testing the new integrity
      // checker's dangling-Immich-link check.
      if (error instanceof BadRequestException && /not found/i.test(error.message)) return null;
      throw error;
    }
  }

  async personThumbnail(immichPersonId: string): Promise<ImmichBinary> {
    return this.requestBinary(`/people/${immichPersonId}/thumbnail`);
  }

  /**
   * `PUT /people/{id}` is flagged deprecated in Immich's v3.2.2 OpenAPI spec
   * (superseded by a bulk `PUT /people`), but it's still live and is the
   * simpler call for renaming one person — matches this file's existing
   * single-id GET pattern, so kept rather than adopting the bulk form for
   * one row.
   */
  private async renamePerson(immichPersonId: string, name: string): Promise<void> {
    await this.request<ImmichPerson>(`/people/${immichPersonId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  /** `POST /people` — used by `tagFace` when a detected face has no Immich person at all yet. */
  private async createImmichPerson(name: string): Promise<ImmichPerson> {
    return this.request<ImmichPerson>("/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async assetImage(assetId: string, size: "thumbnail" | "preview"): Promise<ImmichBinary> {
    return this.requestBinary(`/assets/${assetId}/thumbnail?size=${size}`);
  }

  async assetThumbnail(assetId: string): Promise<ImmichBinary> {
    return this.assetImage(assetId, "thumbnail");
  }

  async assetOriginal(assetId: string): Promise<ImmichBinary> {
    return this.requestBinary(`/assets/${assetId}/original`);
  }

  /**
   * `POST /search/metadata` underlies every asset-listing method in this
   * file (person photos, album assets, the general browser) — one request
   * shape, not three copies of it. Immich's own OpenAPI spec marks
   * `personIds`/`albumIds`/`page` deprecated as of v3.2.0 in favor of a
   * `cursor`-based replacement it doesn't specify yet; they still work at
   * the exact v3.2.2 this app pins (see TECH_STACK.md's Immich version
   * note), but a future Immich upgrade should re-check this against
   * whatever supersedes it.
   */
  private async searchMetadata(
    body: Record<string, unknown>,
  ): Promise<{ items: ImmichAsset[]; nextCursor: string | null }> {
    const result = await this.request<{
      assets: { items: ImmichAsset[]; nextCursor: string | null };
    }>("/search/metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return result.assets;
  }

  /**
   * One `/search/metadata` call per id, not one call with the whole array —
   * Immich's `personIds` filter is an intersection (assets containing every
   * listed person together), not a union, so a single combined call would
   * silently drop photos for a person with more than one linked cluster
   * down to just the ones where both clusters co-occur.
   */
  private async assetsForPersonIds(immichPersonIds: string[]): Promise<ImmichAsset[]> {
    const results = await Promise.all(
      immichPersonIds.map((personId) => this.searchMetadata({ personIds: [personId] })),
    );
    return results.flatMap((result) => result.items);
  }

  private async metadataByAlbumId(): Promise<Map<string, AlbumMetadata>> {
    const [rows, members] = await Promise.all([
      this.db.select().from(albumMetadata),
      this.db.select().from(albumCategoryMembers),
    ]);
    const categoryIdsByAlbum = new Map<string, string[]>();
    for (const member of members) {
      const ids = categoryIdsByAlbum.get(member.albumId) ?? [];
      ids.push(member.categoryId);
      categoryIdsByAlbum.set(member.albumId, ids);
    }
    return new Map(
      rows.map((row) => [
        row.albumId,
        rowToAlbumMetadata(row, categoryIdsByAlbum.get(row.albumId) ?? []),
      ]),
    );
  }

  private async categoryIdsForAlbum(albumId: string): Promise<string[]> {
    const rows = await this.db
      .select({ categoryId: albumCategoryMembers.categoryId })
      .from(albumCategoryMembers)
      .where(eq(albumCategoryMembers.albumId, albumId));
    return rows.map((row) => row.categoryId);
  }

  /**
   * Immich albums, joined with this app's own local metadata (date, place,
   * categories, ...) and, when `filter` is given, narrowed/sorted by it — all
   * done in memory over the full list rather than pushed into SQL, since this
   * is a single-user app with at most a few thousand albums.
   */
  async listAlbums(filter?: ListAlbumsInput): Promise<AlbumWithMetadata[]> {
    const [albums, metadata] = await Promise.all([
      this.request<ImmichAlbum[]>("/albums"),
      this.metadataByAlbumId(),
    ]);
    let merged = albums.map((album) =>
      Object.assign({}, album, metadata.get(album.id) ?? emptyAlbumMetadata),
    );

    if (filter?.search) {
      const pattern = filter.search.toLowerCase();
      merged = merged.filter((album) => album.albumName.toLowerCase().includes(pattern));
    }
    if (filter?.place) {
      const pattern = filter.place.toLowerCase();
      merged = merged.filter((album) => album.place?.toLowerCase().includes(pattern));
    }
    if (filter?.dateFrom != null) {
      const { dateFrom } = filter;
      merged = merged.filter(
        (album) => album.date?.earliest != null && album.date.earliest >= dateFrom,
      );
    }
    if (filter?.dateTo != null) {
      const { dateTo } = filter;
      merged = merged.filter(
        (album) => album.date?.earliest != null && album.date.earliest <= dateTo,
      );
    }
    if (filter?.missingInfo) {
      merged = merged.filter((album) => album.date == null && album.place == null);
    }
    if (filter?.kind) {
      merged = merged.filter((album) => album.kind === filter.kind);
    }

    if (filter?.sort === "name") {
      merged = merged.toSorted((a, b) => a.albumName.localeCompare(b.albumName));
    } else if (filter?.sort === "date") {
      merged = merged.toSorted((a, b) =>
        (a.date?.earliest ?? "").localeCompare(b.date?.earliest ?? ""),
      );
    } else if (filter?.sort === "assetCount") {
      merged = merged.toSorted((a, b) => b.assetCount - a.assetCount);
    }

    return merged;
  }

  async getAlbum(albumId: string): Promise<AlbumWithMetadata> {
    const [album, metadata] = await Promise.all([
      this.request<ImmichAlbum>(`/albums/${albumId}`),
      this.getAlbumMetadata(albumId),
    ]);
    return { ...album, ...metadata };
  }

  async getAlbumMetadata(albumId: string): Promise<AlbumMetadata> {
    const [row] = await this.db
      .select()
      .from(albumMetadata)
      .where(eq(albumMetadata.albumId, albumId))
      .limit(1);
    return row
      ? rowToAlbumMetadata(row, await this.categoryIdsForAlbum(albumId))
      : emptyAlbumMetadata;
  }

  /**
   * Writes the *complete* desired local metadata for an album — like
   * `setAssetTags`, callers always send the whole current state (an edit
   * dialog pre-filled from `getAlbum`), never a partial patch, so a field
   * left out here means "clear it", not "leave it alone".
   *
   * `categoryIds` is the other exception, the other way round: when given
   * it's the complete new set of categories, but leaving it out keeps the
   * album's current ones (see `updateAlbumMetadataInputSchema`). The
   * metadata row and the memberships are written in one transaction, since
   * a membership's foreign key needs the row to exist first.
   *
   * `kind` is the one exception: it isn't part of `UpdateAlbumMetadataInput`
   * at all (creation-only), and is never included in the `onConflictDoUpdate`
   * `set` below, so a normal edit can never change it. `options.kind` is for
   * `createAlbumWithMetadata`'s first-ever insert only; if a row already
   * exists with a *different* stored kind, that's an unexpected id collision
   * or a stale double-submit, not something to silently ignore.
   */
  async upsertAlbumMetadata(
    input: UpdateAlbumMetadataInput,
    options?: { kind?: AlbumKind },
  ): Promise<AlbumMetadata> {
    const date = resolveDate(input.date ?? null) ?? null;
    const place = input.place ?? null;
    const cover = input.cover ?? null;
    const found = input.found ?? null;
    const scanned = input.scanned ?? null;
    const photosPerPage = input.photosPerPage ?? 4;

    const [existing] = await this.db
      .select({ kind: albumMetadata.kind })
      .from(albumMetadata)
      .where(eq(albumMetadata.albumId, input.albumId))
      .limit(1);
    if (existing && options?.kind && options.kind !== existing.kind) {
      throw new BadRequestException("Album kind cannot be changed after creation");
    }
    const kind: AlbumKind =
      (existing?.kind as AlbumKind | undefined) ?? options?.kind ?? "physical";

    const categoryIds = await this.db.transaction(async (tx) => {
      await tx
        .insert(albumMetadata)
        .values({
          albumId: input.albumId,
          date,
          place,
          kind,
          cover,
          found,
          scanned,
          photosPerPage,
        })
        .onConflictDoUpdate({
          target: albumMetadata.albumId,
          set: { date, place, cover, found, scanned, photosPerPage, updatedAt: new Date() },
        });

      if (input.categoryIds === undefined) {
        const rows = await tx
          .select({ categoryId: albumCategoryMembers.categoryId })
          .from(albumCategoryMembers)
          .where(eq(albumCategoryMembers.albumId, input.albumId));
        return rows.map((row) => row.categoryId);
      }

      const wanted = [...new Set(input.categoryIds)];
      if (wanted.length > 0) {
        const known = await tx
          .select({ id: albumCategories.id })
          .from(albumCategories)
          .where(inArray(albumCategories.id, wanted));
        if (known.length !== wanted.length) {
          throw new BadRequestException("Unknown album category");
        }
      }
      await tx.delete(albumCategoryMembers).where(eq(albumCategoryMembers.albumId, input.albumId));
      if (wanted.length > 0) {
        await tx
          .insert(albumCategoryMembers)
          .values(wanted.map((categoryId) => ({ albumId: input.albumId, categoryId })));
      }
      return wanted;
    });
    return { date, place, kind, cover, found, scanned, photosPerPage, categoryIds };
  }

  async createAlbum(input: CreateAlbumInput): Promise<ImmichAlbum> {
    return this.request<ImmichAlbum>("/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  /**
   * Creates the Immich album, then immediately writes its local metadata
   * (kind/cover/found/scanned/photosPerPage) in the same server-side
   * sequence — a client only ever makes one call, so the album can't end up
   * created but stuck with default metadata because a second, separate
   * request failed.
   */
  async createAlbumWithMetadata(input: CreateAlbumWithMetadataInput): Promise<AlbumWithMetadata> {
    const { kind, cover, found, scanned, photosPerPage, categoryIds, ...createInput } = input;
    const album = await this.createAlbum(createInput);
    const metadata = await this.upsertAlbumMetadata(
      { albumId: album.id, cover, found, scanned, photosPerPage, categoryIds },
      { kind },
    );
    return { ...album, ...metadata };
  }

  async updateAlbum(
    albumId: string,
    patch: Omit<UpdateAlbumInput, "albumId">,
  ): Promise<ImmichAlbum> {
    return this.request<ImmichAlbum>(`/albums/${albumId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  private async getAlbumKind(albumId: string): Promise<AlbumKind> {
    const [row] = await this.db
      .select({ kind: albumMetadata.kind })
      .from(albumMetadata)
      .where(eq(albumMetadata.albumId, albumId))
      .limit(1);
    return (row?.kind as AlbumKind | undefined) ?? "physical";
  }

  /**
   * Every asset that's a member of at least one `kind: 'physical'` album,
   * unioned and deduped across all of them, with the source album(s) + this
   * app's own recorded position in each attached — everything the
   * virtual-album picker needs to group candidates by source album (mirrors
   * the mockup's own grouped picker) without a second query, and everything
   * `addAssetsToAlbum` needs to validate a virtual album's additions.
   *
   * `immichAlbumAssetOrder` alone can't answer "which albums is this asset
   * in" — it only records a manual position for assets that have been
   * reordered at least once, never raw membership — so this instead reuses
   * `orderedAlbumAssets` (already the source of truth for "assets in this
   * album, in order") once per physical album. That's one `/search/metadata`
   * call per physical album; acceptable at the "a few thousand albums" scale
   * `listAlbums`'s own comment already assumes for this single-user app —
   * re-check this cost if that assumption stops holding.
   */
  private async physicalAlbumAssetMembership(): Promise<Map<string, EligibleVirtualAlbumAsset>> {
    const physicalAlbums = await this.listAlbums({ kind: "physical" });
    const perAlbum = await Promise.all(
      physicalAlbums.map(async (album) => ({
        album,
        assets: await this.orderedAlbumAssets(album.id),
      })),
    );

    const byAssetId = new Map<string, EligibleVirtualAlbumAsset>();
    for (const { album, assets } of perAlbum) {
      assets.forEach((asset, position) => {
        const sourceAlbum: AssetSourceAlbum = {
          albumId: album.id,
          albumName: album.albumName,
          page: Math.floor(position / album.photosPerPage) + 1,
        };
        const existingEntry = byAssetId.get(asset.id);
        if (existingEntry) {
          existingEntry.sourceAlbums.push(sourceAlbum);
        } else {
          byAssetId.set(asset.id, { asset, sourceAlbums: [sourceAlbum] });
        }
      });
    }
    return byAssetId;
  }

  /**
   * Which physical album(s) a *specific* set of assets belong to — used to
   * caption a virtual album's own photos with their source, without the
   * virtual-album picker's pagination (there are only ever as many assets to
   * look up as the virtual album itself has).
   */
  async sourceAlbumsForAssets(assetIds: string[]): Promise<Record<string, AssetSourceAlbum[]>> {
    const membership = await this.physicalAlbumAssetMembership();
    const wanted = new Set(assetIds);
    const result: Record<string, AssetSourceAlbum[]> = {};
    for (const [assetId, entry] of membership) {
      if (wanted.has(assetId)) result[assetId] = entry.sourceAlbums;
    }
    return result;
  }

  /**
   * Cursor-paginated view of `physicalAlbumAssetMembership` for the
   * virtual-album picker. The cursor is a plain numeric offset into this
   * locally computed, deduped list — not one of Immich's own opaque cursors,
   * since there's no single Immich endpoint this list corresponds to.
   */
  async eligibleVirtualAlbumAssets(
    input: EligibleVirtualAssetsInput,
  ): Promise<{ assets: EligibleVirtualAlbumAsset[]; nextCursor: string | null }> {
    const membership = await this.physicalAlbumAssetMembership();
    const all = [...membership.values()];
    const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    const page = all.slice(offset, offset + input.size);
    const nextOffset = offset + page.length;
    return { assets: page, nextCursor: nextOffset < all.length ? String(nextOffset) : null };
  }

  /**
   * The raw Immich call, with no kind checks — `uploadAsset` uses this
   * directly (a brand-new asset can't already be "eligible" for anything,
   * and physical albums are exactly where uploads are supposed to land), and
   * `addAssetsToAlbum` below calls it too, once it has validated the
   * virtual-album rules. Kept private so every other caller goes through one
   * of those two, not straight to Immich.
   */
  private async attachAssetsToAlbum(albumId: string, assetIds: string[]): Promise<void> {
    await this.request(`/albums/${albumId}/assets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: assetIds }),
    });
  }

  /**
   * The router-facing "add existing photos" mutation — enforces the
   * physical/virtual add-photo split: a physical album only ever grows via
   * upload (`uploadAsset` has the mirror-image guard), never by referencing
   * an existing asset here; a virtual album only ever references assets that
   * already belong to at least one physical album
   * (`physicalAlbumAssetMembership`) — never a fresh upload directly into it.
   */
  async addAssetsToAlbum(albumId: string, assetIds: string[]): Promise<void> {
    const kind = await this.getAlbumKind(albumId);
    if (kind === "physical") {
      throw new BadRequestException("Physical albums only accept new photos by uploading scans");
    }
    const membership = await this.physicalAlbumAssetMembership();
    const ineligible = assetIds.filter((assetId) => !membership.has(assetId));
    if (ineligible.length > 0) {
      throw new BadRequestException(
        "These photos don't belong to any physical album yet, so they can't be referenced by a virtual album",
      );
    }
    await this.attachAssetsToAlbum(albumId, assetIds);
  }

  /** Unlinks assets from this album — the assets themselves stay in Immich's library, in every other album they're also in. */
  async removeAssetsFromAlbum(albumId: string, assetIds: string[]): Promise<void> {
    await this.request(`/albums/${albumId}/assets`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: assetIds }),
    });
    // A removed asset's manual position in this album is meaningless now —
    // prune it rather than leave an orphaned row nothing else will clean up.
    await this.db
      .delete(immichAlbumAssetOrder)
      .where(
        and(
          eq(immichAlbumAssetOrder.albumId, albumId),
          inArray(immichAlbumAssetOrder.assetId, assetIds),
        ),
      );
  }

  async deleteAlbum(albumId: string): Promise<void> {
    await this.request(`/albums/${albumId}`, { method: "DELETE" });
    await this.db.delete(immichAlbumAssetOrder).where(eq(immichAlbumAssetOrder.albumId, albumId));
    await this.db.delete(albumMetadata).where(eq(albumMetadata.albumId, albumId));
  }

  /**
   * `force` deliberately omitted — Immich's default behavior for this
   * endpoint is a soft delete into its own trash (recoverable there for its
   * configured retention period, typically 30 days), not an immediate
   * purge. That's the safer default for a destructive action this app now
   * exposes with only a confirmation dialog standing between a click and
   * the delete.
   */
  async deleteAssets(assetIds: string[]): Promise<void> {
    await this.request("/assets", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: assetIds }),
    });
    // A deleted asset is gone everywhere, not just one album — prune its
    // manual position from every album it happened to hold one in.
    await this.db
      .delete(immichAlbumAssetOrder)
      .where(inArray(immichAlbumAssetOrder.assetId, assetIds));
  }

  /** The asset's caption + tags — only ever fetched per-asset, see `AssetDetail`'s own comment. */
  async getAssetDetail(assetId: string): Promise<AssetDetail> {
    const asset = await this.request<{
      exifInfo?: { description?: string };
      tags?: ImmichTag[];
    }>(`/assets/${assetId}`);
    return { description: asset.exifInfo?.description ?? "", tags: asset.tags ?? [] };
  }

  /**
   * One `GET /assets/{id}` per id, run in parallel — Immich has no bulk
   * multi-get for full asset detail (checked; only `/search/metadata`,
   * which omits exactly the fields this needs). Used only behind the
   * album page's explicit "Check captions" toggle, never on every grid
   * load — see `AssetDetail`'s own comment for why.
   */
  async getAssetDetails(assetIds: string[]): Promise<Record<string, AssetDetail>> {
    const details = await Promise.all(
      assetIds.map(async (assetId) => [assetId, await this.getAssetDetail(assetId)] as const),
    );
    return Object.fromEntries(details);
  }

  async updateAssetDescription(assetId: string, description: string): Promise<void> {
    await this.request(`/assets/${assetId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description }),
    });
  }

  /** Immich's own native tags (`GET /tags`), for the tag editor's autocomplete — not this app's `album_metadata.tags`. */
  async listImmichTags(): Promise<ImmichTag[]> {
    return this.request<ImmichTag[]>("/tags");
  }

  private async findOrCreateTagsByName(names: string[]): Promise<ImmichTag[]> {
    if (names.length === 0) return [];
    const existing = await this.listImmichTags();
    const existingByName = new Map(existing.map((tag) => [tag.name.toLowerCase(), tag]));
    return Promise.all(
      names.map(async (name) => {
        const found = existingByName.get(name.toLowerCase());
        if (found) return found;
        return this.request<ImmichTag>("/tags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }),
    );
  }

  /**
   * Replaces this one asset's whole set of Immich-native tags with
   * `tagNames` — diffed against its current tags so only the actual
   * additions/removals hit the API, not a blanket unassign-then-reassign.
   * A not-yet-existing name is created first (`findOrCreateTagsByName`),
   * matching `TagInput`'s own "still accepts anything typed" contract.
   */
  async setAssetTags(input: SetAssetTagsInput): Promise<void> {
    const [{ tags: currentTags }, wantedTags] = await Promise.all([
      this.getAssetDetail(input.assetId),
      this.findOrCreateTagsByName(input.tagNames),
    ]);
    const currentIds = new Set(currentTags.map((tag) => tag.id));
    const wantedIds = new Set(wantedTags.map((tag) => tag.id));
    const toAdd = wantedTags.filter((tag) => !currentIds.has(tag.id));
    const toRemove = currentTags.filter((tag) => !wantedIds.has(tag.id));

    if (toAdd.length > 0) {
      await this.request("/tags/assets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagIds: toAdd.map((tag) => tag.id), assetIds: [input.assetId] }),
      });
    }
    await Promise.all(
      toRemove.map((tag) =>
        this.request(`/tags/${tag.id}/assets`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: [input.assetId] }),
        }),
      ),
    );
  }

  async albumAssets(albumId: string): Promise<ImmichAsset[]> {
    return (await this.searchMetadata({ albumIds: [albumId] })).items;
  }

  /**
   * `albumAssets` above, reordered by this app's own manual positions where
   * one is recorded (`immichAlbumAssetOrder` — see that table's comment for
   * why this is the one piece of local state in an otherwise Immich-is-
   * sole-source-of-truth integration). Assets with no recorded position
   * (added to the album since the last reorder, e.g. via Immich's own UI, or
   * this app's own upload/add-existing-photos) are appended at the end in
   * whatever order Immich itself returned them — new arrivals default to
   * "end of album" until manually repositioned. Rows whose asset is no
   * longer actually in the album (removed elsewhere) are silently dropped,
   * not surfaced as an error — same "fails open" reasoning as
   * `personImmichLinks`'s dangling-link handling.
   */
  async orderedAlbumAssets(albumId: string): Promise<ImmichAsset[]> {
    const assets = await this.albumAssets(albumId);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));

    const orderRows = await this.db
      .select({ assetId: immichAlbumAssetOrder.assetId })
      .from(immichAlbumAssetOrder)
      .where(eq(immichAlbumAssetOrder.albumId, albumId))
      .orderBy(asc(immichAlbumAssetOrder.position));

    const ordered: ImmichAsset[] = [];
    const seen = new Set<string>();
    for (const row of orderRows) {
      const asset = assetById.get(row.assetId);
      if (asset) {
        ordered.push(asset);
        seen.add(asset.id);
      }
    }
    for (const asset of assets) {
      if (!seen.has(asset.id)) {
        ordered.push(asset);
      }
    }
    return ordered;
  }

  /**
   * Replaces this album's whole manual order with `assetIdsInOrder` —
   * always the *complete* new sequence from the drag-and-drop grid, not a
   * single moved item, so this can just delete-and-reinsert rather than
   * juggle individual position updates.
   */
  async reorderAlbumAssets(albumId: string, assetIdsInOrder: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(immichAlbumAssetOrder).where(eq(immichAlbumAssetOrder.albumId, albumId));
      if (assetIdsInOrder.length > 0) {
        await tx.insert(immichAlbumAssetOrder).values(
          assetIdsInOrder.map((assetId, index) => ({
            albumId,
            assetId,
            position: index,
          })),
        );
      }
    });
  }

  /**
   * `POST /download/info` — how many zip archives a given set of assets
   * needs, and each one's asset ids/size. Immich splits into more than one
   * only if the total original-file size exceeds its own configured limit;
   * callers check `.length` rather than assuming `[0]` is everything — see
   * `AlbumZipService`, the only caller, for why a big set is welcomed here
   * rather than refused.
   */
  async downloadGroupsForAssetIds(
    assetIds: string[],
  ): Promise<{ assetIds: string[]; size: number }[]> {
    const result = await this.request<{ archives: { assetIds: string[]; size: number }[] }>(
      "/download/info",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetIds }),
      },
    );
    return result.archives;
  }

  /**
   * `POST /download/archive` — the actual zip bytes, as a stream. Neither
   * `request` (always parses the response as JSON) nor `requestBinary`
   * (GET-only, and buffers the whole response into a `Buffer` — fine for a
   * thumbnail, not for an album-sized zip) fits here, so this is its own
   * thin `fetch`, checked for failure the same way `request` is but handing
   * back the raw body stream instead of buffering it — the controller pipes
   * it straight to the HTTP response.
   */
  async downloadArchive(
    assetIds: string[],
    archiveName: string,
  ): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
    const { url, apiKey } = this.requireConfig();
    const response = await fetch(`${url}/api/download/archive`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ assetIds, archiveName }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BadRequestException(
        `Immich request failed: ${response.status} ${response.statusText} (/download/archive)${body ? ` — ${body}` : ""}`,
      );
    }
    if (!response.body) {
      throw new BadRequestException("Immich returned an empty archive response");
    }
    return {
      body: response.body,
      contentType: response.headers.get("content-type") ?? "application/zip",
    };
  }

  /** The general "browse everything" view — no album/person filter required. */
  async searchAssets(
    input: SearchAssetsInput,
  ): Promise<{ assets: ImmichAsset[]; nextCursor: string | null }> {
    const body: Record<string, unknown> = { size: input.size };
    if (input.albumId) body.albumIds = [input.albumId];
    if (input.personIds && input.personIds.length > 0) body.personIds = input.personIds;
    if (input.cursor) body.cursor = input.cursor;
    const { items, nextCursor } = await this.searchMetadata(body);
    return { assets: items, nextCursor };
  }

  /**
   * Immich already runs face detection automatically on every asset it
   * ingests — this exists for the cases that misses: photos uploaded before
   * face recognition was enabled, or a face the first pass didn't catch.
   * Just enqueues; `ImmichFaceScanProcessor` does the actual work.
   */
  async enqueueFaceRescan(userId: string): Promise<void> {
    await this.faceScanQueue.add(RESCAN_FACES_JOB, { userId });
  }

  /**
   * Called only by `ImmichFaceScanProcessor`. Walks every asset in the
   * library (`searchMetadata` with no filters) and asks Immich to re-run its
   * own `refresh-faces` job on each one, in batches — Immich's own
   * machine-learning pipeline does the actual detection asynchronously from
   * there, so "done" here means "requested", not "every face is now
   * tagged". `assetIds` is capped per request to keep each `/assets/jobs`
   * body a reasonable size against a library with thousands of photos.
   */
  async rescanAllFaces(userId: string): Promise<void> {
    const BATCH_SIZE = 500;
    const assetIds: string[] = [];
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = cursor ? { cursor } : {};
      // Each page's cursor comes from the previous page's response — sequential by design.
      // eslint-disable-next-line no-await-in-loop
      const page = await this.searchMetadata(body);
      assetIds.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    const batches: string[][] = [];
    for (let i = 0; i < assetIds.length; i += BATCH_SIZE) {
      batches.push(assetIds.slice(i, i + BATCH_SIZE));
    }
    await Promise.all(
      batches.map((batch) =>
        this.request("/assets/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "refresh-faces", assetIds: batch }),
        }),
      ),
    );

    await this.notifications.create({
      userId,
      type: "immich_faces_rescanned",
      title: "Face re-scan requested",
      body: `Requested a face-detection re-scan for ${assetIds.length} photo${assetIds.length === 1 ? "" : "s"} in your Immich library. Immich runs detection in the background — check back in a few minutes.`,
    });
  }

  /**
   * `GET /faces?id=` — despite the query param being named `id` (and typed
   * as the same `FaceDto` the reassign endpoint's body uses), Immich's own
   * `PersonService.getFacesById` treats it as the **asset** id, not a face
   * id — confirmed against Immich's server source (`person.service.ts`)
   * rather than assumed from the OpenAPI description, which is misleading
   * here (verified during planning: don't trust the param name alone).
   */
  async facesForAsset(assetId: string): Promise<ImmichFace[]> {
    const raw = await this.request<RawImmichFace[]>(`/faces?id=${assetId}`);
    if (raw.length === 0) return [];

    const immichPersonIds = [
      ...new Set(raw.flatMap((face) => (face.person ? [face.person.id] : []))),
    ];
    const links =
      immichPersonIds.length === 0
        ? []
        : await this.db
            .select({
              personId: personImmichLinks.personId,
              immichPersonId: personImmichLinks.immichPersonId,
              linkId: personImmichLinks.id,
            })
            .from(personImmichLinks)
            .where(inArray(personImmichLinks.immichPersonId, immichPersonIds));
    const linkByImmichPersonId = new Map(links.map((link) => [link.immichPersonId, link]));

    return raw.map((face) => {
      const link = face.person ? linkByImmichPersonId.get(face.person.id) : undefined;
      return {
        id: face.id,
        box: {
          left: face.boundingBoxX1 / face.imageWidth,
          top: face.boundingBoxY1 / face.imageHeight,
          width: (face.boundingBoxX2 - face.boundingBoxX1) / face.imageWidth,
          height: (face.boundingBoxY2 - face.boundingBoxY1) / face.imageHeight,
        },
        immichPerson: face.person,
        linkedPerson: link ? { personId: link.personId, linkId: link.linkId } : null,
      };
    });
  }

  /**
   * Reassigns an already-detected face to a (possibly new) Immich person,
   * then links that person to a genealogy person — the write path for a
   * face with no Immich person yet, or the wrong one. A face that already
   * belongs to the *right* Immich person just needs the plain `link` call
   * below, not this.
   *
   * Order matters for what's recoverable on failure:
   * 1. `assertLinkable` first — cheap, local, fails before any Immich write.
   * 2. Create the Immich person if the caller didn't pick an existing one.
   * 3. `PUT /faces/{immichPersonId}` — the write that actually matters. Note
   *    the inversion versus what the endpoint name suggests: the **path**
   *    parameter is the *person* id being assigned to, and the *face* id
   *    goes in the body (`{ id: faceId }`) — confirmed against Immich's
   *    server source (`FaceController.reassignFacesById` /
   *    `PersonService.reassignFacesById`), not guessed from the OpenAPI
   *    schema names alone, which read the other way round.
   * 4. `link()` — if this fails after step 3 succeeded, the face is tagged
   *    in Immich but not yet linked locally; recoverable by retrying from
   *    the same dialog, since the Immich person id result is still known.
   */
  async tagFace(input: TagFaceInput): Promise<{ immichPersonId: string; linkId: string | null }> {
    let immichPersonId = input.immichPersonId;
    if (immichPersonId) {
      await this.assertLinkable(input.personId, immichPersonId);
    } else if (input.newImmichPersonName) {
      const created = await this.createImmichPerson(input.newImmichPersonName);
      immichPersonId = created.id;
    } else {
      throw new BadRequestException("Either immichPersonId or newImmichPersonName is required");
    }

    await this.request(`/faces/${immichPersonId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: input.faceId }),
    });

    const row = await this.link(input.personId, immichPersonId);
    return { immichPersonId, linkId: row.id };
  }

  /** `POST /assets`, multipart. Adds to `albumId` afterward when given — Immich's upload call itself has no album parameter. */
  async uploadAsset(file: UploadedImmichFile, albumId?: string): Promise<UploadAssetResult> {
    const { url, apiKey } = this.requireConfig();

    // Read the whole file into memory once here, after multer's own
    // `diskStorage` already avoided buffering it during the inbound parse
    // (see the controller) — true zero-copy streaming to Immich would need
    // the `form-data` package (Node's built-in `FormData`/`Blob` can't
    // stream from disk); one bounded (IMMICH_MAX_UPLOAD_BYTES-capped)
    // in-memory copy at forward time is a reasonable middle ground at this
    // app's scale.
    const bytes = await readFile(file.path);
    const now = new Date().toISOString();
    const form = new FormData();
    form.set("assetData", new Blob([bytes], { type: file.mimetype }), file.originalname);
    form.set("filename", file.originalname);
    form.set("fileCreatedAt", now);
    form.set("fileModifiedAt", now);

    const response = await fetch(`${url}/api/assets`, {
      method: "POST",
      headers: { "x-api-key": apiKey, accept: "application/json" },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BadRequestException(
        `Immich upload failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
      );
    }
    const result = (await response.json()) as { id: string; status: "created" | "duplicate" };
    const isDuplicate = result.status === "duplicate";

    if (albumId) {
      // Mirror-image guard to `addAssetsToAlbum`'s: a virtual album never
      // receives a fresh upload, only references to assets already sitting
      // in a physical album — those come in through `addAssetsToAlbum`
      // instead. A brand-new asset can't already be "eligible" for one, so
      // there's no membership check to run here, just the kind check.
      const kind = await this.getAlbumKind(albumId);
      if (kind === "virtual") {
        throw new BadRequestException(
          'Virtual albums only accept photos already in a physical album — use "Add photos" instead of uploading',
        );
      }
      await this.attachAssetsToAlbum(albumId, [result.id]);
    }

    return { assetId: result.id, isDuplicate };
  }

  /**
   * Every Immich person linked to this genealogy person, resolved to
   * name/hidden status. A link whose Immich person was since deleted or
   * merged away is silently dropped rather than surfaced as an error — see
   * "browse and link only" in FEATURES.md: a dangling link should degrade
   * gracefully, not break the page.
   */
  async linkedPeople(personId: string): Promise<LinkedImmichPerson[]> {
    const links = await this.db
      .select()
      .from(personImmichLinks)
      .where(eq(personImmichLinks.personId, personId));
    const resolved = await Promise.all(
      links.map(async (link) => {
        const person = await this.getPerson(link.immichPersonId);
        return person ? [{ ...person, linkId: link.id }] : [];
      }),
    );
    return resolved.flat();
  }

  /**
   * Every `person_immich_links` row whose Immich person no longer resolves
   * (deleted or merged away in Immich itself) — the same dangling-link
   * check every other read here already does silently (see `linkedPeople`'s
   * own comment), surfaced explicitly for `IntegrityService.checkData` so
   * an admin can see the "fails open" cases instead of them just quietly
   * not showing a photo.
   */
  async listDanglingLinks(): Promise<
    {
      linkId: string;
      personId: string;
      personGiven: string;
      personSurname: string;
      immichPersonId: string;
    }[]
  > {
    const links = await this.db
      .select({
        linkId: personImmichLinks.id,
        personId: personImmichLinks.personId,
        immichPersonId: personImmichLinks.immichPersonId,
        personGiven: persons.given,
        personSurname: persons.surname,
      })
      .from(personImmichLinks)
      .innerJoin(persons, eq(personImmichLinks.personId, persons.id));
    const results = await Promise.all(
      links.map(async (link) => {
        const person = await this.getPerson(link.immichPersonId);
        return person ? [] : [link];
      }),
    );
    return results.flat();
  }

  /** Every photo across all of this person's linked Immich person ids, deduplicated. */
  async photosForPerson(personId: string): Promise<ImmichAsset[]> {
    const links = await this.db
      .select({ immichPersonId: personImmichLinks.immichPersonId })
      .from(personImmichLinks)
      .where(eq(personImmichLinks.personId, personId));
    const assets = await this.assetsForPersonIds(links.map((link) => link.immichPersonId));
    return [...new Map(assets.map((asset) => [asset.id, asset])).values()];
  }

  /**
   * `immichPersonId` is unique across the whole table (see schema.ts) — one
   * face cluster represents at most one genealogy person — so a second link
   * attempt for an already-linked Immich person is rejected with a clear
   * reason rather than the raw unique-violation. Shared by `link` and
   * `tagFace`, which both need this check before doing anything remote.
   */
  private async assertLinkable(personId: string, immichPersonId: string): Promise<void> {
    const [existing] = await this.db
      .select({ personId: personImmichLinks.personId })
      .from(personImmichLinks)
      .where(eq(personImmichLinks.immichPersonId, immichPersonId))
      .limit(1);
    if (existing) {
      throw new BadRequestException(
        existing.personId === personId
          ? "Already linked to this person"
          : "This Immich person is already linked to someone else",
      );
    }
  }

  async link(personId: string, immichPersonId: string): Promise<PersonImmichLinkRow> {
    const person = await this.getPerson(immichPersonId);
    if (!person) {
      throw new BadRequestException("No such Immich person");
    }
    await this.assertLinkable(personId, immichPersonId);
    const [row] = await this.db
      .insert(personImmichLinks)
      .values({ personId, immichPersonId })
      .returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }

    // Best-effort: push the tree person's name into Immich so its own UI
    // shows the same name instead of whatever it guessed (usually
    // "Unnamed"). Never blocks the link itself — a rename failure would be
    // an odd, transient Immich-side problem, not a reason to lose the link
    // the user just made, so it's logged rather than thrown. See "fails
    // open" in TECH_STACK.md for the same philosophy applied to reads.
    const [treePerson] = await this.db
      .select({ given: persons.given, surname: persons.surname })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);
    if (treePerson) {
      try {
        await this.renamePerson(immichPersonId, formatPersonName(treePerson));
      } catch (error) {
        this.logger.warn(
          `Could not sync name to Immich person ${immichPersonId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return row;
  }

  /**
   * A no-op if the link was already removed. `link()` best-effort renames
   * the Immich cluster to the tree person's name; without the mirror image
   * of that here, a since-unlinked face kept showing the *previous*
   * person's name in the photo viewer indefinitely (until, and unless, it
   * happened to be relinked to someone else later) — confirmed live as a
   * real bug, not just a stale-cache appearance. Best-effort in the same
   * sense as `link()`'s own rename: never blocks the unlink itself.
   */
  async unlink(linkId: string): Promise<void> {
    const [existing] = await this.db
      .select({ immichPersonId: personImmichLinks.immichPersonId })
      .from(personImmichLinks)
      .where(eq(personImmichLinks.id, linkId))
      .limit(1);
    await this.db.delete(personImmichLinks).where(eq(personImmichLinks.id, linkId));
    if (existing) {
      try {
        await this.renamePerson(existing.immichPersonId, "");
      } catch (error) {
        this.logger.warn(
          `Could not clear name on Immich person ${existing.immichPersonId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
