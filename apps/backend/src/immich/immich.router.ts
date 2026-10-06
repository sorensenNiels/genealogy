import {
  albumAssetsInputSchema,
  assetDetailsInputSchema,
  createAlbumWithMetadataInputSchema,
  deleteAlbumInputSchema,
  deleteAssetsInputSchema,
  eligibleVirtualAssetsInputSchema,
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
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { AlbumZipService } from "./album-zip.service.js";
import { ImmichService } from "./immich.service.js";

const listPeopleInput = z.object({
  page: z.number().int().min(1).default(1),
  // Capped at 1000, Immich's own documented max for this endpoint —
  // `ImmichPersonPicker` requests everything in one call rather than
  // paginating, so it needs the full range, not the old max(100).
  size: z.number().int().min(1).max(1000).default(50),
});

@Injectable()
export class ImmichRouter {
  constructor(
    private readonly immich: ImmichService,
    private readonly albumZips: AlbumZipService,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      isConfigured: protectedProcedure.query(() => this.immich.isConfigured()),

      listPeople: protectedProcedure
        .input(listPeopleInput)
        .query(({ input }) => this.immich.listPeople(input.page, input.size)),

      linkedPeople: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.immich.linkedPeople(input.personId)),

      photos: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.immich.photosForPerson(input.personId)),

      link: protectedProcedure
        .input(z.object({ personId: personIdSchema, immichPersonId: z.string().min(1) }))
        .mutation(({ input }) => this.immich.link(input.personId, input.immichPersonId)),

      unlink: protectedProcedure
        .input(z.object({ linkId: z.uuid() }))
        .mutation(async ({ input }) => {
          await this.immich.unlink(input.linkId);
          return { ok: true } as const;
        }),

      listAlbums: protectedProcedure
        .input(listAlbumsInputSchema.optional())
        .query(({ input }) => this.immich.listAlbums(input)),

      album: protectedProcedure
        .input(z.object({ albumId: immichAlbumIdSchema }))
        .query(({ input }) => this.immich.getAlbum(input.albumId)),

      createAlbum: protectedProcedure
        .input(createAlbumWithMetadataInputSchema)
        .mutation(({ input }) => this.immich.createAlbumWithMetadata(input)),

      updateAlbum: protectedProcedure.input(updateAlbumInputSchema).mutation(({ input }) => {
        const { albumId, ...patch } = input;
        return this.immich.updateAlbum(albumId, patch);
      }),

      updateAlbumMetadata: protectedProcedure
        .input(updateAlbumMetadataInputSchema)
        .mutation(({ input }) => this.immich.upsertAlbumMetadata(input)),

      addAlbumAssets: protectedProcedure
        .input(albumAssetsInputSchema)
        .mutation(async ({ input }) => {
          await this.immich.addAssetsToAlbum(input.albumId, input.assetIds);
          return { ok: true } as const;
        }),

      removeAlbumAssets: protectedProcedure
        .input(albumAssetsInputSchema)
        .mutation(async ({ input }) => {
          await this.immich.removeAssetsFromAlbum(input.albumId, input.assetIds);
          return { ok: true } as const;
        }),

      deleteAlbum: protectedProcedure.input(deleteAlbumInputSchema).mutation(async ({ input }) => {
        await this.immich.deleteAlbum(input.albumId);
        return { ok: true } as const;
      }),

      deleteAssets: protectedProcedure
        .input(deleteAssetsInputSchema)
        .mutation(async ({ input }) => {
          await this.immich.deleteAssets(input.assetIds);
          return { ok: true } as const;
        }),

      albumAssets: protectedProcedure
        .input(z.object({ albumId: immichAlbumIdSchema }))
        .query(({ input }) => this.immich.orderedAlbumAssets(input.albumId)),

      eligibleVirtualAlbumAssets: protectedProcedure
        .input(eligibleVirtualAssetsInputSchema)
        .query(({ input }) => this.immich.eligibleVirtualAlbumAssets(input)),

      sourceAlbumsForAssets: protectedProcedure
        .input(assetDetailsInputSchema)
        .query(({ input }) => this.immich.sourceAlbumsForAssets(input.assetIds)),

      reorderAlbumAssets: protectedProcedure
        .input(reorderAlbumAssetsInputSchema)
        .mutation(async ({ input }) => {
          await this.immich.reorderAlbumAssets(input.albumId, input.assetIds);
          return { ok: true } as const;
        }),

      searchAssets: protectedProcedure
        .input(searchAssetsInputSchema)
        .query(({ input }) => this.immich.searchAssets(input)),

      assetFaces: protectedProcedure
        .input(z.object({ assetId: immichAssetIdSchema }))
        .query(({ input }) => this.immich.facesForAsset(input.assetId)),

      assetDetail: protectedProcedure
        .input(z.object({ assetId: immichAssetIdSchema }))
        .query(({ input }) => this.immich.getAssetDetail(input.assetId)),

      assetDetails: protectedProcedure
        .input(assetDetailsInputSchema)
        .query(({ input }) => this.immich.getAssetDetails(input.assetIds)),

      updateAssetDescription: protectedProcedure
        .input(updateAssetDescriptionInputSchema)
        .mutation(async ({ input }) => {
          await this.immich.updateAssetDescription(input.assetId, input.description);
          return { ok: true } as const;
        }),

      immichTags: protectedProcedure.query(() => this.immich.listImmichTags()),

      setAssetTags: protectedProcedure
        .input(setAssetTagsInputSchema)
        .mutation(async ({ input }) => {
          await this.immich.setAssetTags(input);
          return { ok: true } as const;
        }),

      tagFace: protectedProcedure
        .input(tagFaceInputSchema)
        .mutation(({ input }) => this.immich.tagFace(input)),

      rescanFaces: protectedProcedure.mutation(async ({ ctx }) => {
        await this.immich.enqueueFaceRescan(ctx.session.user.id);
        return { queued: true } as const;
      }),

      enqueueAlbumZip: protectedProcedure
        .input(z.object({ albumId: immichAlbumIdSchema }))
        .mutation(async ({ input, ctx }) => {
          await this.albumZips.enqueueAlbumZip(ctx.session.user.id, input.albumId);
          return { queued: true } as const;
        }),

      enqueueAllAlbumsZip: protectedProcedure.mutation(async ({ ctx }) => {
        await this.albumZips.enqueueAlbumZip(ctx.session.user.id);
        return { queued: true } as const;
      }),
    });
  }
}
