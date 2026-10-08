import {
  createPersonExternalIdSchema,
  personExternalIdIdSchema,
  personIdSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { editorProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { ExternalIdService } from "./external-id.service.js";

@Injectable()
export class ExternalIdRouter {
  constructor(
    private readonly externalIds: ExternalIdService,
    private readonly redactor: PersonRedactor,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      list: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input, ctx }) =>
          this.redactor.listFor(viewerOf(ctx), input.personId, () =>
            this.externalIds.list(input.personId),
          ),
        ),

      add: editorProcedure.input(createPersonExternalIdSchema).mutation(async ({ input }) => {
        await this.externalIds.add(input);
        return { ok: true } as const;
      }),

      remove: editorProcedure
        .input(z.object({ id: personExternalIdIdSchema }))
        .mutation(async ({ input }) => {
          await this.externalIds.remove(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
