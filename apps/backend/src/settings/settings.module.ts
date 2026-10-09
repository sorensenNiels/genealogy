import { Module } from "@nestjs/common";

import { SettingsRouter } from "./settings.router.js";
import { SettingsService } from "./settings.service.js";

@Module({
  providers: [SettingsService, SettingsRouter],
  // SettingsService is exported for the person and GEDCOM modules, which
  // read the person settings ("presumed deceased after N years").
  exports: [SettingsRouter, SettingsService],
})
export class SettingsModule {}
