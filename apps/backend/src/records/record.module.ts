import { Module } from "@nestjs/common";

import { SettingsModule } from "../settings/settings.module.js";
import { RecordRouter } from "./record.router.js";
import { RecordService } from "./record.service.js";

@Module({
  imports: [SettingsModule],
  providers: [RecordService, RecordRouter],
  // RecordService is exported for merging (repointing a duplicate's rows)
  // and the data integrity check (age mismatches).
  exports: [RecordRouter, RecordService],
})
export class RecordModule {}
