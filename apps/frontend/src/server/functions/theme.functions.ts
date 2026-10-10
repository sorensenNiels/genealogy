import { createThemeSchema, themeIdSchema, updateThemeSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

/** The theme to show this visitor — their own, the site's, or Nova; works signed out too. */
export const getActiveTheme = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.theme.active.query(),
);

/** Every theme, the site default and the member's own choice — for the pickers. */
export const getThemeState = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.theme.state.query(),
);

export const setMyTheme = createServerFn({ method: "POST" })
  .validator(z.object({ id: themeIdSchema.nullable() }))
  .handler(({ data }) => trpcProxy.theme.setMine.mutate(data));

export const setSiteTheme = createServerFn({ method: "POST" })
  .validator(z.object({ id: themeIdSchema }))
  .handler(({ data }) => trpcProxy.theme.setSiteDefault.mutate(data));

export const createTheme = createServerFn({ method: "POST" })
  .validator(createThemeSchema)
  .handler(({ data }) => trpcProxy.theme.create.mutate(data));

export const updateTheme = createServerFn({ method: "POST" })
  .validator(updateThemeSchema)
  .handler(({ data }) => trpcProxy.theme.update.mutate(data));

export const removeTheme = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) => trpcProxy.theme.remove.mutate(data));
