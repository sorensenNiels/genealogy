import { createStaticSiteSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";

import { adminProcedure, router } from "../trpc/trpc.base.js";
import { StaticSiteService } from "./static-site.service.js";

@Injectable()
export class StaticSiteRouter {
  constructor(private readonly staticSites: StaticSiteService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      // Admin-only: it exports everyone in the tree, not one reader's view of it.
      create: adminProcedure.input(createStaticSiteSchema).mutation(async ({ ctx, input }) => {
        await this.staticSites.enqueue(ctx.session.user.id, input);
        return { queued: true } as const;
      }),
    });
  }
}
