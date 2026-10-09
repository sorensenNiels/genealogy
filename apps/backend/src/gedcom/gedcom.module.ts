import { Module } from "@nestjs/common";

import { SettingsModule } from "../settings/settings.module.js";
import { GedcomImportService } from "./gedcom-import.service.js";
import { GedcomRouter } from "./gedcom.router.js";
import { GedcomService } from "./gedcom.service.js";

@Module({
  imports: [SettingsModule],
  providers: [GedcomService, GedcomImportService, GedcomRouter],
  exports: [GedcomRouter],
})
export class GedcomModule {}
