import { Injectable } from "@nestjs/common";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { GedcomService } from "./gedcom.service.js";

@Injectable()
export class GedcomRouter {
  constructor(private readonly gedcom: GedcomService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      export: protectedProcedure.query(async () => ({ gedcom: await this.gedcom.exportAll() })),
    });
  }
}
