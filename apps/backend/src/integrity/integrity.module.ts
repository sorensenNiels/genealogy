import { Module } from "@nestjs/common";

import { ImmichModule } from "../immich/immich.module.js";
import { IntegrityRouter } from "./integrity.router.js";
import { IntegrityService } from "./integrity.service.js";

@Module({
  imports: [ImmichModule],
  providers: [IntegrityService, IntegrityRouter],
  exports: [IntegrityRouter],
})
export class IntegrityModule {}
