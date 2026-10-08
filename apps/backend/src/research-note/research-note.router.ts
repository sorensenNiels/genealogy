import {
  createResearchNoteSchema,
  personIdSchema,
  researchNoteIdSchema,
  updateResearchNoteSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { editorProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { ResearchNoteService } from "./research-note.service.js";

@Injectable()
export class ResearchNoteRouter {
  constructor(
    private readonly researchNotes: ResearchNoteService,
    private readonly redactor: PersonRedactor,
  ) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.researchNotes` would still be undefined.
   */
  build() {
    return router({
      listNotes: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input, ctx }) =>
          this.redactor.listFor(viewerOf(ctx), input.personId, () =>
            this.researchNotes.listNotes(input.personId),
          ),
        ),

      addNote: editorProcedure
        .input(createResearchNoteSchema)
        .mutation(({ input }) => this.researchNotes.addNote(input)),

      updateNote: editorProcedure
        .input(updateResearchNoteSchema)
        .mutation(({ input }) => this.researchNotes.updateNote(input)),

      removeNote: editorProcedure
        .input(z.object({ id: researchNoteIdSchema }))
        .mutation(async ({ input }) => {
          await this.researchNotes.removeNote(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
