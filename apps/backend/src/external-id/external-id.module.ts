import { Module } from "@nestjs/common";

import { ExternalIdRouter } from "./external-id.router.js";
import { ExternalIdService } from "./external-id.service.js";

@Module({
  providers: [ExternalIdService, ExternalIdRouter],
  exports: [ExternalIdRouter],
})
export class ExternalIdModule {}
