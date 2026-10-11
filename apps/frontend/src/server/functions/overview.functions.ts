import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

/** The member's own date, so "On this day" and the featured ancestor follow their calendar. */
const todaySchema = z.object({ today: z.iso.date() });

export const getOnThisDay = createServerFn({ method: "GET" })
  .validator(todaySchema)
  .handler(({ data }) => trpcProxy.overview.onThisDay.query(data));

export const getFeaturedAncestor = createServerFn({ method: "GET" })
  .validator(todaySchema)
  .handler(({ data }) => trpcProxy.overview.featuredAncestor.query(data));

export const getFamilyAtAGlance = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.familyAtAGlance.query(),
);

export const getTopPlaces = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.topPlaces.query(),
);

export const getResearchTodo = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.researchTodo.query(),
);

export const getCensusGaps = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.censusGaps.query(),
);

export const getRecentChanges = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.overview.recentChanges.query(),
);

export const getUpkeep = createServerFn({ method: "GET" })
  .validator(z.object({ refresh: z.boolean().default(false) }))
  .handler(({ data }) => trpcProxy.overview.upkeep.query(data));
