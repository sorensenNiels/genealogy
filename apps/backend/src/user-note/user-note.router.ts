import { createUserNoteSchema, updateUserNoteSchema, userNoteIdSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { UserNoteService } from "./user-note.service.js";

@Injectable()
export class UserNoteRouter {
  constructor(private readonly userNotes: UserNoteService) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.userNotes` would still be undefined.
   */
  build() {
    return router({
      // Every procedure reads `ctx.session.user.id` rather than trusting an
      // input field, the same reasoning as ProfileRouter — a note's owner
      // isn't something a caller gets to assert.
      listNotes: protectedProcedure.query(({ ctx }) =>
        this.userNotes.listNotes(ctx.session.user.id),
      ),

      addNote: protectedProcedure
        .input(createUserNoteSchema)
        .mutation(({ input, ctx }) => this.userNotes.addNote(ctx.session.user.id, input)),

      updateNote: protectedProcedure
        .input(updateUserNoteSchema)
        .mutation(({ input, ctx }) => this.userNotes.updateNote(ctx.session.user.id, input)),

      removeNote: protectedProcedure
        .input(z.object({ id: userNoteIdSchema }))
        .mutation(async ({ input, ctx }) => {
          await this.userNotes.removeNote(ctx.session.user.id, input.id);
          return { ok: true } as const;
        }),
    });
  }
}
