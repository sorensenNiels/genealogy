import { Module } from "@nestjs/common";

import { ImmichModule } from "../immich/immich.module.js";
import { RecordModule } from "../records/record.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { IntegrityRouter } from "./integrity.router.js";
import { IntegrityService } from "./integrity.service.js";

@Module({
  // Settings → Person page holds the consistency checks' limits.
  imports: [ImmichModule, RecordModule, SettingsModule],
  providers: [IntegrityService, IntegrityRouter],
  exports: [IntegrityRouter, IntegrityService],
})
export class IntegrityModule {}
