import { Module } from "@nestjs/common";

import { GedcomRouter } from "./gedcom.router.js";
import { GedcomService } from "./gedcom.service.js";

@Module({
  providers: [GedcomService, GedcomRouter],
  exports: [GedcomRouter],
})
export class GedcomModule {}
