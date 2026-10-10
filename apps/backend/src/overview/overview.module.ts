import { Module } from "@nestjs/common";

import { OverviewRouter } from "./overview.router.js";
import { OverviewService } from "./overview.service.js";

@Module({
  providers: [OverviewService, OverviewRouter],
  exports: [OverviewRouter],
})
export class OverviewModule {}
