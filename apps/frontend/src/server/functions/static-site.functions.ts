import { createStaticSiteSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

/** Enqueues the static family website export; the zip arrives later via a "static_site_ready" notification, like `createBackup`. */
export const createStaticSite = createServerFn({ method: "POST" })
  .validator(createStaticSiteSchema)
  .handler(({ data }) => trpcProxy.staticSite.create.mutate(data));
