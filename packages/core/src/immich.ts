import { z } from "zod";

import { historicalDateSchema } from "./person.js";

/**
 * Immich's own ids, kept as opaque strings rather than `z.uuid()` — this
 * app never generates them and only ever passes them straight through to
 * Immich's API, the same treatment `ImmichService`'s existing methods
 * already give `immichPersonId`/`albumId`.
 */
export const immichAssetIdSchema = z.string().min(1);
export const immichAlbumIdSchema = z.string().min(1);
export const immichFaceIdSchema = z.string().min(1);
export const immichPersonIdSchema = z.string().min(1);

export const createAlbumInputSchema = z.object({
  albumName: z.string().trim().min(1).max(200),
  description: z.string().trim().optional(),
  assetIds: z.array(immichAssetIdSchema).optional(),
});
export type CreateAlbumInput = z.infer<typeof createAlbumInputSchema>;

/**
 * "physical" mirrors a real scanned album and only grows via upload;
 * "virtual" only ever references assets that already live in a physical
 * album. Structural, not a `configurableOptions` topic — see
 * `albumMetadata.kind`'s doc comment in `@genealogy/db`'s schema for why.
 * Set once at creation; immutable after (`ImmichService.upsertAlbumMetadata`
 * rejects an attempt to change it on an existing row).
 */
export const albumKindSchema = z.enum(["physical", "virtual"]);
export type AlbumKind = z.infer<typeof albumKindSchema>;

export const albumCoverStyleSchema = z.enum(["foil", "label", "tooled"]);
export type AlbumCoverStyle = z.infer<typeof albumCoverStyleSchema>;

/** Shelf-spine/book-cover appearance, chosen at creation — physical albums only. */
export const albumCoverSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Expected a 6-digit hex color"),
  style: albumCoverStyleSchema,
});
export type AlbumCover = z.infer<typeof albumCoverSchema>;

/**
 * Combines Immich's own album creation with this app's local metadata in one
 * input, so the two writes (`POST /albums` then `upsertAlbumMetadata`) happen
 * as a single server-side sequence rather than two round-trips from the
 * client — see `ImmichService.createAlbumWithMetadata`.
 */
export const createAlbumWithMetadataInputSchema = createAlbumInputSchema.extend({
  kind: albumKindSchema,
  cover: albumCoverSchema.optional(),
  found: z.string().trim().max(200).optional(),
  scanned: z.string().trim().max(200).optional(),
  photosPerPage: z.number().int().min(1).max(20).optional(),
});
export type CreateAlbumWithMetadataInput = z.infer<typeof createAlbumWithMetadataInputSchema>;

export const updateAlbumInputSchema = z.object({
  albumId: immichAlbumIdSchema,
  albumName: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().optional(),
  albumThumbnailAssetId: immichAssetIdSchema.optional(),
});
export type UpdateAlbumInput = z.infer<typeof updateAlbumInputSchema>;

export const albumAssetsInputSchema = z.object({
  albumId: immichAlbumIdSchema,
  assetIds: z.array(immichAssetIdSchema).min(1),
});
export type AlbumAssetsInput = z.infer<typeof albumAssetsInputSchema>;

export const deleteAlbumInputSchema = z.object({ albumId: immichAlbumIdSchema });
export type DeleteAlbumInput = z.infer<typeof deleteAlbumInputSchema>;

export const deleteAssetsInputSchema = z.object({
  assetIds: z.array(immichAssetIdSchema).min(1),
});
export type DeleteAssetsInput = z.infer<typeof deleteAssetsInputSchema>;

/** `assetIds` is the *complete* new order for the album, not a single moved item — the drag-and-drop grid always sends its whole current sequence. */
export const reorderAlbumAssetsInputSchema = z.object({
  albumId: immichAlbumIdSchema,
  assetIds: z.array(immichAssetIdSchema),
});
export type ReorderAlbumAssetsInput = z.infer<typeof reorderAlbumAssetsInputSchema>;

export const searchAssetsInputSchema = z.object({
  albumId: immichAlbumIdSchema.optional(),
  personIds: z.array(immichPersonIdSchema).optional(),
  /** Opaque cursor from a previous page's response — not an offset/page number. */
  cursor: z.string().optional(),
  size: z.number().int().min(1).max(100).default(50),
});
export type SearchAssetsInput = z.infer<typeof searchAssetsInputSchema>;

/**
 * Exactly one of `immichPersonId`/`newImmichPersonName` should be set — the
 * face either joins an existing Immich person cluster or a brand-new one
 * created for it. See `ImmichService.tagFace` for why this can't be
 * expressed as a discriminated union without complicating the tRPC input.
 */
export const tagFaceInputSchema = z.object({
  faceId: immichFaceIdSchema,
  personId: z.uuid(), // genealogy person
  immichPersonId: immichPersonIdSchema.optional(),
  newImmichPersonName: z.string().trim().min(1).optional(),
});
export type TagFaceInput = z.infer<typeof tagFaceInputSchema>;

/** Local metadata layered on an Immich album — see `albumMetadata` in `@genealogy/db`'s schema. */
export const albumTagSchema = z.string().trim().min(1).max(50);

/**
 * `kind` is deliberately absent here — it's creation-only
 * (`createAlbumWithMetadataInputSchema`) and immutable after, so the edit
 * path has no way to even express changing it.
 */
export const updateAlbumMetadataInputSchema = z.object({
  albumId: immichAlbumIdSchema,
  date: historicalDateSchema.nullable().optional(),
  place: z.string().trim().max(200).nullable().optional(),
  tags: z.array(albumTagSchema).max(50).optional(),
  cover: albumCoverSchema.nullable().optional(),
  found: z.string().trim().max(200).nullable().optional(),
  scanned: z.string().trim().max(200).nullable().optional(),
  photosPerPage: z.number().int().min(1).max(20).optional(),
});
export type UpdateAlbumMetadataInput = z.infer<typeof updateAlbumMetadataInputSchema>;

/**
 * All filters are optional and combine with AND, except `tags` which matches
 * ANY of the given tags (OR) — narrowing by tag is meant to broaden a search
 * across sources/themes independently, not require every tag at once.
 */
export const listAlbumsInputSchema = z.object({
  search: z.string().trim().optional(),
  tags: z.array(albumTagSchema).optional(),
  place: z.string().trim().optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  missingInfo: z.boolean().optional(),
  sort: z.enum(["name", "date", "assetCount"]).optional(),
  kind: albumKindSchema.optional(),
});
export type ListAlbumsInput = z.infer<typeof listAlbumsInputSchema>;

/**
 * Candidate assets for a virtual album's picker — cursor-paginated the same
 * way `searchAssetsInputSchema` is, but the cursor here is a plain numeric
 * offset into a locally-computed, deduped list (see
 * `ImmichService.eligibleVirtualAlbumAssets`), not one of Immich's own opaque
 * cursors.
 */
export const eligibleVirtualAssetsInputSchema = z.object({
  cursor: z.string().optional(),
  size: z.number().int().min(1).max(100).default(50),
});
export type EligibleVirtualAssetsInput = z.infer<typeof eligibleVirtualAssetsInputSchema>;

export const updateAssetDescriptionInputSchema = z.object({
  assetId: immichAssetIdSchema,
  description: z.string().trim().max(1000),
});
export type UpdateAssetDescriptionInput = z.infer<typeof updateAssetDescriptionInputSchema>;

export const assetDetailsInputSchema = z.object({
  assetIds: z.array(immichAssetIdSchema).min(1),
});
export type AssetDetailsInput = z.infer<typeof assetDetailsInputSchema>;

/**
 * Immich's own native per-asset tags (`GET/PUT /api/tags`), distinct from
 * this app's local `album_metadata.tags` — see `ImmichService.setAssetTags`.
 * The frontend always sends the whole desired name set (matching `TagInput`'s
 * own `onChange` contract), never a delta; the backend diffs it against the
 * asset's current tags.
 */
export const setAssetTagsInputSchema = z.object({
  assetId: immichAssetIdSchema,
  tagNames: z.array(albumTagSchema).max(50),
});
export type SetAssetTagsInput = z.infer<typeof setAssetTagsInputSchema>;

/**
 * Splits an album's flat, already-ordered asset list into fixed-size pages
 * for the book view's reading mode — the "simple auto-pagination" decision:
 * no per-photo page number is stored, `photosPerPage` (`album_metadata`) is
 * the only extra state, and pages are always recomputed from it plus the
 * existing order. The last page keeps whatever's left over, so it may be
 * shorter than `perPage`. Shared between `apps/backend` (virtual-album source
 * captions) and `apps/frontend`/`packages/ui` (the book view itself) so this
 * logic exists exactly once.
 */
export function paginate<T>(orderedItems: readonly T[], perPage: number): T[][] {
  if (perPage < 1) throw new Error("perPage must be at least 1");
  const pages: T[][] = [];
  for (let i = 0; i < orderedItems.length; i += perPage) {
    pages.push(orderedItems.slice(i, i + perPage));
  }
  return pages;
}

/** 1-based page number the given asset id falls on, or `null` if it isn't in `orderedAssetIds` at all. */
export function pageNumberOf(
  orderedAssetIds: readonly string[],
  perPage: number,
  assetId: string,
): number | null {
  const index = orderedAssetIds.indexOf(assetId);
  if (index === -1) return null;
  return Math.floor(index / perPage) + 1;
}
