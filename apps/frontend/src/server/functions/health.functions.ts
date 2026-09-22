import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

export const getHealth = createServerFn({ method: "GET" }).handler(() => trpcProxy.health.query());
