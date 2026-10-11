import { Module } from "@nestjs/common";

import { ImmichModule } from "../immich/immich.module.js";
import { RecordModule } from "../records/record.module.js";
import { IntegrityRouter } from "./integrity.router.js";
import { IntegrityService } from "./integrity.service.js";

@Module({
  imports: [ImmichModule, RecordModule],
  providers: [IntegrityService, IntegrityRouter],
  exports: [IntegrityRouter, IntegrityService],
})
export class IntegrityModule {}
