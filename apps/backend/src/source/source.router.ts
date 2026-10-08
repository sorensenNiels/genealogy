import {
  citationIdSchema,
  createCitationSchema,
  createSourceSchema,
  personIdSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { editorProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { SourceService } from "./source.service.js";

@Injectable()
export class SourceRouter {
  constructor(
    private readonly sources: SourceService,
    private readonly redactor: PersonRedactor,
  ) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.sources` would still be undefined.
   */
  build() {
    return router({
      listSources: protectedProcedure.query(() => this.sources.listSources()),

      createSource: editorProcedure
        .input(createSourceSchema)
        .mutation(({ input }) => this.sources.createSource(input)),

      listCitations: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input, ctx }) =>
          this.redactor.listFor(viewerOf(ctx), input.personId, () =>
            this.sources.listCitations(input.personId),
          ),
        ),

      addCitation: editorProcedure
        .input(createCitationSchema)
        .mutation(({ input }) => this.sources.addCitation(input)),

      removeCitation: editorProcedure
        .input(z.object({ id: citationIdSchema }))
        .mutation(async ({ input }) => {
          await this.sources.removeCitation(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
