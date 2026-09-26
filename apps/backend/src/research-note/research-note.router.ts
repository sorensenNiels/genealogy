import {
  createResearchNoteSchema,
  personIdSchema,
  researchNoteIdSchema,
  updateResearchNoteSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { ResearchNoteService } from "./research-note.service.js";

@Injectable()
export class ResearchNoteRouter {
  constructor(private readonly researchNotes: ResearchNoteService) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.researchNotes` would still be undefined.
   */
  build() {
    return router({
      listNotes: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.researchNotes.listNotes(input.personId)),

      addNote: protectedProcedure
        .input(createResearchNoteSchema)
        .mutation(({ input }) => this.researchNotes.addNote(input)),

      updateNote: protectedProcedure
        .input(updateResearchNoteSchema)
        .mutation(({ input }) => this.researchNotes.updateNote(input)),

      removeNote: protectedProcedure
        .input(z.object({ id: researchNoteIdSchema }))
        .mutation(async ({ input }) => {
          await this.researchNotes.removeNote(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
