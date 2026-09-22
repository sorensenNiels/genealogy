import {
  citationIdSchema,
  createCitationSchema,
  createSourceSchema,
  personIdSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listSources = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.source.listSources.query(),
);

export const createSource = createServerFn({ method: "POST" })
  .validator(createSourceSchema)
  .handler(({ data }) => trpcProxy.source.createSource.mutate(data));

export const listCitations = createServerFn({ method: "GET" })
  .validator(z.object({ personId: personIdSchema }))
  .handler(({ data }) => trpcProxy.source.listCitations.query(data));

export const addCitation = createServerFn({ method: "POST" })
  .validator(createCitationSchema)
  .handler(({ data }) => trpcProxy.source.addCitation.mutate(data));

export const removeCitation = createServerFn({ method: "POST" })
  .validator(z.object({ id: citationIdSchema }))
  .handler(({ data }) => trpcProxy.source.removeCitation.mutate(data));
