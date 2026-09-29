import { Injectable } from "@nestjs/common";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { IntegrityService } from "./integrity.service.js";

@Injectable()
export class IntegrityRouter {
  constructor(private readonly integrity: IntegrityService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      checkData: protectedProcedure.query(() => this.integrity.checkData()),
      checkGraphConsistency: protectedProcedure.query(() => this.integrity.checkGraphConsistency()),
    });
  }
}
