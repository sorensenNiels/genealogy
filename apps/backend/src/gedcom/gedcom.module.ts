import { Module } from "@nestjs/common";

import { GedcomImportService } from "./gedcom-import.service.js";
import { GedcomRouter } from "./gedcom.router.js";
import { GedcomService } from "./gedcom.service.js";

@Module({
  providers: [GedcomService, GedcomImportService, GedcomRouter],
  exports: [GedcomRouter],
})
export class GedcomModule {}
