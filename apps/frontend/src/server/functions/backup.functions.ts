import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

/** Enqueues a backup job on apps/backend's BullMQ queue; the file itself arrives later via a "backup ready" notification. */
export const createBackup = createServerFn({ method: "POST" }).handler(() =>
  trpcProxy.backup.create.mutate(),
);
