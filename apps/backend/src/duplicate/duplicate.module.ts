import { Module } from "@nestjs/common";

import { DuplicateRouter } from "./duplicate.router.js";
import { DuplicateService } from "./duplicate.service.js";

@Module({
  providers: [DuplicateService, DuplicateRouter],
  exports: [DuplicateRouter, DuplicateService],
})
export class DuplicateModule {}
