import { Injectable } from "@nestjs/common";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { OverviewService } from "./overview.service.js";

@Injectable()
export class OverviewRouter {
  constructor(
    private readonly overview: OverviewService,
    private readonly redactor: PersonRedactor,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      // Each member's own; their own person is never redacted for them
      // (`PersonRedactor`), and ancestor counts say nothing about anyone.
      myLine: protectedProcedure.query(async ({ ctx }) => {
        const line = await this.overview.myLine(ctx.session.user.id);
        if (!line) return null;
        return { ...line, person: await this.redactor.person(viewerOf(ctx), line.person) };
      }),

      lastTree: protectedProcedure.query(async ({ ctx }) => {
        const last = await this.overview.lastTree(ctx.session.user.id);
        if (!last) return null;
        return { ...last, person: await this.redactor.person(viewerOf(ctx), last.person) };
      }),

      // A Viewer may have opened a living relative's page (they see it by
      // name only) — the list shows them the same way.
      recentPeople: protectedProcedure.query(async ({ ctx }) =>
        this.redactor.people(viewerOf(ctx), await this.overview.recentPeople(ctx.session.user.id)),
      ),
    });
  }
}
