import { personIdSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { ImmichService } from "./immich.service.js";

const listPeopleInput = z.object({
  page: z.number().int().min(1).default(1),
  size: z.number().int().min(1).max(100).default(50),
});

@Injectable()
export class ImmichRouter {
  constructor(private readonly immich: ImmichService) {}

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

      listAlbums: protectedProcedure.query(() => this.immich.listAlbums()),

      albumAssets: protectedProcedure
        .input(z.object({ albumId: z.string().min(1) }))
        .query(({ input }) => this.immich.albumAssets(input.albumId)),
    });
  }
}
