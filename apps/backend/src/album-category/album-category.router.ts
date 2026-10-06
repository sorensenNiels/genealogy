import {
  albumCategoryIdSchema,
  createAlbumCategorySchema,
  updateAlbumCategorySchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { AlbumCategoryService } from "./album-category.service.js";

@Injectable()
export class AlbumCategoryRouter {
  constructor(private readonly categories: AlbumCategoryService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      list: protectedProcedure.query(() => this.categories.list()),

      create: protectedProcedure
        .input(createAlbumCategorySchema)
        .mutation(({ input }) => this.categories.create(input)),

      update: protectedProcedure
        .input(updateAlbumCategorySchema)
        .mutation(({ input }) => this.categories.update(input)),

      remove: protectedProcedure
        .input(z.object({ id: albumCategoryIdSchema }))
        .mutation(async ({ input }) => {
          await this.categories.remove(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
