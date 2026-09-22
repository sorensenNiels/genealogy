import { Module } from "@nestjs/common";

import { SettingsRouter } from "./settings.router.js";
import { SettingsService } from "./settings.service.js";

@Module({
  providers: [SettingsService, SettingsRouter],
  exports: [SettingsRouter],
})
export class SettingsModule {}
