import { duplicatePairInputSchema, personIdSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listDuplicates = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.duplicate.list.query(),
);

export const getDuplicatesForPerson = createServerFn({ method: "GET" })
  .validator(z.object({ personId: personIdSchema }))
  .handler(({ data }) => trpcProxy.duplicate.forPerson.query(data));

export const dismissDuplicate = createServerFn({ method: "POST" })
  .validator(duplicatePairInputSchema)
  .handler(({ data }) => trpcProxy.duplicate.dismiss.mutate(data));

export const undismissDuplicate = createServerFn({ method: "POST" })
  .validator(duplicatePairInputSchema)
  .handler(({ data }) => trpcProxy.duplicate.undismiss.mutate(data));

export const clearDuplicateDismissals = createServerFn({ method: "POST" }).handler(() =>
  trpcProxy.duplicate.clearDismissals.mutate(),
);
