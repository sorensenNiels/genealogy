import {
  albumCategoryIdSchema,
  createAlbumCategorySchema,
  updateAlbumCategorySchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listAlbumCategories = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.albumCategory.list.query(),
);

export const createAlbumCategory = createServerFn({ method: "POST" })
  .validator(createAlbumCategorySchema)
  .handler(({ data }) => trpcProxy.albumCategory.create.mutate(data));

export const updateAlbumCategory = createServerFn({ method: "POST" })
  .validator(updateAlbumCategorySchema)
  .handler(({ data }) => trpcProxy.albumCategory.update.mutate(data));

export const removeAlbumCategory = createServerFn({ method: "POST" })
  .validator(z.object({ id: albumCategoryIdSchema }))
  .handler(({ data }) => trpcProxy.albumCategory.remove.mutate(data));
