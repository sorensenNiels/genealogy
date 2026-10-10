import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

export const getMyLine = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.myLine.query(),
);

export const getLastTree = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.lastTree.query(),
);

export const getRecentPeople = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.recentPeople.query(),
);
