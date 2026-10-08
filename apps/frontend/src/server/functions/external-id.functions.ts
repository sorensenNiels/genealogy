import {
  createPersonExternalIdSchema,
  personExternalIdIdSchema,
  personIdSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listExternalIds = createServerFn({ method: "GET" })
  .validator(z.object({ personId: personIdSchema }))
  .handler(({ data }) => trpcProxy.externalId.list.query(data));

export const addExternalId = createServerFn({ method: "POST" })
  .validator(createPersonExternalIdSchema)
  .handler(({ data }) => trpcProxy.externalId.add.mutate(data));

export const removeExternalId = createServerFn({ method: "POST" })
  .validator(z.object({ id: personExternalIdIdSchema }))
  .handler(({ data }) => trpcProxy.externalId.remove.mutate(data));
