import { associationIdSchema, createAssociationSchema, personIdSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { editorProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { AssociationService } from "./association.service.js";

@Injectable()
export class AssociationRouter {
  constructor(
    private readonly associations: AssociationService,
    private readonly redactor: PersonRedactor,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      list: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(async ({ input, ctx }) => {
          const viewer = viewerOf(ctx);
          if (await this.redactor.isHidden(viewer, input.personId)) {
            return { own: [], appearances: [] };
          }
          // A role this person holds on someone else's record names that
          // record's event (a baptism date, say) — hidden when its owner, or
          // the owner's partner in the marriage it's tied to, is.
          const result = await this.associations.list(input.personId);
          const hidden = await this.redactor.hiddenIds(
            viewer,
            result.appearances.flatMap((row) => [
              row.personId,
              ...(row.unionPartnerId ? [row.unionPartnerId] : []),
            ]),
          );
          return {
            own: result.own,
            appearances: result.appearances.filter(
              (row) =>
                !hidden.has(row.personId) &&
                !(row.unionPartnerId && hidden.has(row.unionPartnerId)),
            ),
          };
        }),

      add: editorProcedure
        .input(createAssociationSchema)
        .mutation(({ input }) => this.associations.add(input)),

      remove: editorProcedure
        .input(z.object({ id: associationIdSchema }))
        .mutation(async ({ input }) => {
          await this.associations.remove(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
