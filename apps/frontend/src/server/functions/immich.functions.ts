import { personIdSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const isImmichConfigured = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.immich.isConfigured.query(),
);

const listPeopleInput = z.object({
  page: z.number().int().min(1).default(1),
  size: z.number().int().min(1).max(100).default(50),
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

export const listImmichAlbums = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.immich.listAlbums.query(),
);

export const listAlbumAssets = createServerFn({ method: "GET" })
  .validator(z.object({ albumId: z.string().min(1) }))
  .handler(({ data }) => trpcProxy.immich.albumAssets.query(data));
