import { duplicatePairInputSchema, personIdSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { adminProcedure, router } from "../trpc/trpc.base.js";
import { DuplicateService } from "./duplicate.service.js";

@Injectable()
export class DuplicateRouter {
  constructor(private readonly duplicates: DuplicateService) {}

  /**
   * Built by a method rather than a field initializer — same reason as every
   * other router in this app. Admin-only throughout: the only thing to do
   * with a suggestion is merge (admin) or dismiss it, and admins see every
   * person unredacted, so no `PersonRedactor` pass is needed.
   */
  build() {
    return router({
      list: adminProcedure.query(() => this.duplicates.list()),
      forPerson: adminProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.duplicates.forPerson(input.personId)),
      dismiss: adminProcedure.input(duplicatePairInputSchema).mutation(async ({ input, ctx }) => {
        await this.duplicates.dismiss(input.personAId, input.personBId, ctx.session.user.id);
        return { ok: true } as const;
      }),
      undismiss: adminProcedure.input(duplicatePairInputSchema).mutation(async ({ input }) => {
        await this.duplicates.undismiss(input.personAId, input.personBId);
        return { ok: true } as const;
      }),
      clearDismissals: adminProcedure.mutation(() => this.duplicates.clearDismissals()),
    });
  }
}
