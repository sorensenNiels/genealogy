import { associationIdSchema, createAssociationSchema, personIdSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { AssociationService } from "./association.service.js";

@Injectable()
export class AssociationRouter {
  constructor(private readonly associations: AssociationService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      list: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.associations.list(input.personId)),

      add: protectedProcedure
        .input(createAssociationSchema)
        .mutation(({ input }) => this.associations.add(input)),

      remove: protectedProcedure
        .input(z.object({ id: associationIdSchema }))
        .mutation(async ({ input }) => {
          await this.associations.remove(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
