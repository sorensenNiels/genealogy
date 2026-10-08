import { gedcomExportInputSchema, gedcomImportInputSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

/** Walks the whole tree and returns the GEDCOM text directly — small enough at this app's scale to skip the queue-and-notify pattern `createBackup` uses. */
export const exportGedcom = createServerFn({ method: "GET" })
  .validator(gedcomExportInputSchema)
  .handler(({ data }) => trpcProxy.gedcom.export.query(data));

/**
 * The file arrives already decoded to text (`decodeGedcomBytes`, in the
 * browser) — a JSON body, not a multipart upload, so a server function is
 * fine here despite buffering: even a large tree's GEDCOM is a few MB of
 * text, unlike the photo/backup uploads that need a raw API route.
 */
export const previewGedcomImport = createServerFn({ method: "POST" })
  .validator(gedcomImportInputSchema)
  .handler(({ data }) => trpcProxy.gedcom.previewImport.mutate(data));

export const importGedcom = createServerFn({ method: "POST" })
  .validator(gedcomImportInputSchema)
  .handler(({ data }) => trpcProxy.gedcom.import.mutate(data));
