import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

/** Walks the whole tree and returns the GEDCOM text directly — small enough at this app's scale to skip the queue-and-notify pattern `createBackup` uses. */
export const exportGedcom = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.gedcom.export.query(),
);
