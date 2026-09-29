import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

export const checkDataIntegrity = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.integrity.checkData.query(),
);

export const checkGraphConsistency = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.integrity.checkGraphConsistency.query(),
);
