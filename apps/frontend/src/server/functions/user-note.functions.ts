import { createUserNoteSchema, updateUserNoteSchema, userNoteIdSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listUserNotes = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.userNote.listNotes.query(),
);

export const addUserNote = createServerFn({ method: "POST" })
  .validator(createUserNoteSchema)
  .handler(({ data }) => trpcProxy.userNote.addNote.mutate(data));

export const updateUserNote = createServerFn({ method: "POST" })
  .validator(updateUserNoteSchema)
  .handler(({ data }) => trpcProxy.userNote.updateNote.mutate(data));

export const removeUserNote = createServerFn({ method: "POST" })
  .validator(z.object({ id: userNoteIdSchema }))
  .handler(({ data }) => trpcProxy.userNote.removeNote.mutate(data));
