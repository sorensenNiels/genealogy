import {
  createResearchNoteSchema,
  personIdSchema,
  researchNoteIdSchema,
  updateResearchNoteSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listNotes = createServerFn({ method: "GET" })
  .validator(z.object({ personId: personIdSchema }))
  .handler(({ data }) => trpcProxy.researchNote.listNotes.query(data));

export const addNote = createServerFn({ method: "POST" })
  .validator(createResearchNoteSchema)
  .handler(({ data }) => trpcProxy.researchNote.addNote.mutate(data));

export const updateNote = createServerFn({ method: "POST" })
  .validator(updateResearchNoteSchema)
  .handler(({ data }) => trpcProxy.researchNote.updateNote.mutate(data));

export const removeNote = createServerFn({ method: "POST" })
  .validator(z.object({ id: researchNoteIdSchema }))
  .handler(({ data }) => trpcProxy.researchNote.removeNote.mutate(data));
