import { searchInputSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

export const searchFullText = createServerFn({ method: "GET" })
  .validator(searchInputSchema)
  .handler(({ data }) => trpcProxy.search.fullText.query(data));
