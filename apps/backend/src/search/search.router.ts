import { searchInputSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { SearchService } from "./search.service.js";

@Injectable()
export class SearchRouter {
  constructor(
    private readonly searches: SearchService,
    private readonly redactor: PersonRedactor,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      /**
       * Any member may search, but a Viewer gets no hit tied to someone
       * living: notes and citations are exactly what the person page hides
       * from them, and a snippet would give it away.
       */
      fullText: protectedProcedure.input(searchInputSchema).query(async ({ input, ctx }) => {
        const { raw, truncated } = await this.searches.search(input.query);
        const hidden = await this.redactor.hiddenIds(viewerOf(ctx), this.searches.personIdsOf(raw));
        return { hits: await this.searches.describe(raw, hidden), truncated };
      }),
    });
  }
}
