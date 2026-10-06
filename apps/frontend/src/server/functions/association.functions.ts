import { associationIdSchema, createAssociationSchema, personIdSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

/** Both directions at once: roles on this person's records, and other people's records they appear in. */
export const listAssociations = createServerFn({ method: "GET" })
  .validator(z.object({ personId: personIdSchema }))
  .handler(({ data }) => trpcProxy.association.list.query(data));

export const addAssociation = createServerFn({ method: "POST" })
  .validator(createAssociationSchema)
  .handler(({ data }) => trpcProxy.association.add.mutate(data));

export const removeAssociation = createServerFn({ method: "POST" })
  .validator(z.object({ id: associationIdSchema }))
  .handler(({ data }) => trpcProxy.association.remove.mutate(data));
