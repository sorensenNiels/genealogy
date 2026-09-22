import {
  addConfigurableOptionSchema,
  configurableOptionIdSchema,
  moveConfigurableOptionSchema,
  updateConfigurableOptionSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listOptions = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.settings.listOptions.query(),
);

export const addOption = createServerFn({ method: "POST" })
  .validator(addConfigurableOptionSchema)
  .handler(({ data }) => trpcProxy.settings.addOption.mutate(data));

export const updateOption = createServerFn({ method: "POST" })
  .validator(updateConfigurableOptionSchema)
  .handler(({ data }) => trpcProxy.settings.updateOption.mutate(data));

export const moveOption = createServerFn({ method: "POST" })
  .validator(moveConfigurableOptionSchema)
  .handler(({ data }) => trpcProxy.settings.moveOption.mutate(data));

export const removeOption = createServerFn({ method: "POST" })
  .validator(z.object({ id: configurableOptionIdSchema }))
  .handler(({ data }) => trpcProxy.settings.removeOption.mutate(data));
