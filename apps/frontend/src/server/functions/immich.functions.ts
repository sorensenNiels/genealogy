import {
  albumAssetsInputSchema,
  assetDetailsInputSchema,
  createAlbumInputSchema,
  deleteAlbumInputSchema,
  deleteAssetsInputSchema,
  immichAlbumIdSchema,
  immichAssetIdSchema,
  listAlbumsInputSchema,
  personIdSchema,
  reorderAlbumAssetsInputSchema,
  searchAssetsInputSchema,
  setAssetTagsInputSchema,
  tagFaceInputSchema,
  updateAlbumInputSchema,
  updateAlbumMetadataInputSchema,
  updateAssetDescriptionInputSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const isImmichConfigured = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.immich.isConfigured.query(),
);

const listPeopleInput = z.object({
  page: z.number().int().min(1).default(1),
  // Capped at 1000, matching the backend router's own schema — see that
  // one's comment. Kept in sync by hand since this server function
  // validates independently before the call ever reaches the backend.
  size: z.number().int().min(1).max(1000).default(50),
});

export const listImmichPeople = createServerFn({ method: "GET" })
  .validator(listPeopleInput)
  .handler(({ data }) => trpcProxy.immich.listPeople.query(data));

const byPersonId = z.object({ personId: personIdSchema });

export const listLinkedImmichPeople = createServerFn({ method: "GET" })
  .validator(byPersonId)
  .handler(({ data }) => trpcProxy.immich.linkedPeople.query(data));

export const listPersonPhotos = createServerFn({ method: "GET" })
  .validator(byPersonId)
  .handler(({ data }) => trpcProxy.immich.photos.query(data));

export const linkImmichPerson = createServerFn({ method: "POST" })
  .validator(z.object({ personId: personIdSchema, immichPersonId: z.string().min(1) }))
  .handler(({ data }) => trpcProxy.immich.link.mutate(data));

export const unlinkImmichPerson = createServerFn({ method: "POST" })
  .validator(z.object({ linkId: z.uuid() }))
  .handler(({ data }) => trpcProxy.immich.unlink.mutate(data));

export const listImmichAlbums = createServerFn({ method: "GET" })
  .validator(listAlbumsInputSchema.optional())
  .handler(({ data }) => trpcProxy.immich.listAlbums.query(data));

export const listImmichAlbumTags = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.immich.albumTags.query(),
);

export const listAlbumAssets = createServerFn({ method: "GET" })
  .validator(z.object({ albumId: z.string().min(1) }))
  .handler(({ data }) => trpcProxy.immich.albumAssets.query(data));

export const getImmichAlbum = createServerFn({ method: "GET" })
  .validator(z.object({ albumId: immichAlbumIdSchema }))
  .handler(({ data }) => trpcProxy.immich.album.query(data));

export const createImmichAlbum = createServerFn({ method: "POST" })
  .validator(createAlbumInputSchema)
  .handler(({ data }) => trpcProxy.immich.createAlbum.mutate(data));

export const updateImmichAlbum = createServerFn({ method: "POST" })
  .validator(updateAlbumInputSchema)
  .handler(({ data }) => trpcProxy.immich.updateAlbum.mutate(data));

export const updateImmichAlbumMetadata = createServerFn({ method: "POST" })
  .validator(updateAlbumMetadataInputSchema)
  .handler(({ data }) => trpcProxy.immich.updateAlbumMetadata.mutate(data));

export const addImmichAlbumAssets = createServerFn({ method: "POST" })
  .validator(albumAssetsInputSchema)
  .handler(({ data }) => trpcProxy.immich.addAlbumAssets.mutate(data));

export const removeImmichAlbumAssets = createServerFn({ method: "POST" })
  .validator(albumAssetsInputSchema)
  .handler(({ data }) => trpcProxy.immich.removeAlbumAssets.mutate(data));

export const deleteImmichAlbum = createServerFn({ method: "POST" })
  .validator(deleteAlbumInputSchema)
  .handler(({ data }) => trpcProxy.immich.deleteAlbum.mutate(data));

export const deleteImmichAssets = createServerFn({ method: "POST" })
  .validator(deleteAssetsInputSchema)
  .handler(({ data }) => trpcProxy.immich.deleteAssets.mutate(data));

export const reorderImmichAlbumAssets = createServerFn({ method: "POST" })
  .validator(reorderAlbumAssetsInputSchema)
  .handler(({ data }) => trpcProxy.immich.reorderAlbumAssets.mutate(data));

export const searchImmichAssets = createServerFn({ method: "GET" })
  .validator(searchAssetsInputSchema)
  .handler(({ data }) => trpcProxy.immich.searchAssets.query(data));

export const listImmichAssetFaces = createServerFn({ method: "GET" })
  .validator(z.object({ assetId: immichAssetIdSchema }))
  .handler(({ data }) => trpcProxy.immich.assetFaces.query(data));

export const getImmichAssetDetail = createServerFn({ method: "GET" })
  .validator(z.object({ assetId: immichAssetIdSchema }))
  .handler(({ data }) => trpcProxy.immich.assetDetail.query(data));

export const getImmichAssetDetails = createServerFn({ method: "GET" })
  .validator(assetDetailsInputSchema)
  .handler(({ data }) => trpcProxy.immich.assetDetails.query(data));

export const updateImmichAssetDescription = createServerFn({ method: "POST" })
  .validator(updateAssetDescriptionInputSchema)
  .handler(({ data }) => trpcProxy.immich.updateAssetDescription.mutate(data));

export const listImmichTags = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.immich.immichTags.query(),
);

export const setImmichAssetTags = createServerFn({ method: "POST" })
  .validator(setAssetTagsInputSchema)
  .handler(({ data }) => trpcProxy.immich.setAssetTags.mutate(data));

export const tagImmichFace = createServerFn({ method: "POST" })
  .validator(tagFaceInputSchema)
  .handler(({ data }) => trpcProxy.immich.tagFace.mutate(data));

export const rescanImmichFaces = createServerFn({ method: "POST" }).handler(() =>
  trpcProxy.immich.rescanFaces.mutate(),
);

export const enqueueAlbumZip = createServerFn({ method: "POST" })
  .validator(z.object({ albumId: immichAlbumIdSchema }))
  .handler(({ data }) => trpcProxy.immich.enqueueAlbumZip.mutate(data));

export const enqueueAllAlbumsZip = createServerFn({ method: "POST" }).handler(() =>
  trpcProxy.immich.enqueueAllAlbumsZip.mutate(),
);
