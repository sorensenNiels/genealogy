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

export const updateAlbumMetadataInputSchema = z.object({
  albumId: immichAlbumIdSchema,
  date: historicalDateSchema.nullable().optional(),
  place: z.string().trim().max(200).nullable().optional(),
  tags: z.array(albumTagSchema).max(50).optional(),
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
});
export type ListAlbumsInput = z.infer<typeof listAlbumsInputSchema>;

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
