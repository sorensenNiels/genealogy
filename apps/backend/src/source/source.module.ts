import { Module } from "@nestjs/common";

import { SourceRouter } from "./source.router.js";
import { SourceService } from "./source.service.js";

@Module({
  providers: [SourceService, SourceRouter],
  exports: [SourceRouter],
})
export class SourceModule {}
