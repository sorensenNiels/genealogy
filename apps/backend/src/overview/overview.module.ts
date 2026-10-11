import { Module } from "@nestjs/common";

import { DuplicateModule } from "../duplicate/duplicate.module.js";
import { ImmichModule } from "../immich/immich.module.js";
import { IntegrityModule } from "../integrity/integrity.module.js";
import { PersonModule } from "../person/person.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { OverviewFamilyService } from "./overview-family.service.js";
import { OverviewResearchService } from "./overview-research.service.js";
import { OverviewRouter } from "./overview.router.js";
import { OverviewService } from "./overview.service.js";

@Module({
  // The upkeep card counts with the Tools reports' own services.
  imports: [DuplicateModule, ImmichModule, IntegrityModule, PersonModule, SettingsModule],
  providers: [OverviewService, OverviewFamilyService, OverviewResearchService, OverviewRouter],
  exports: [OverviewRouter],
})
export class OverviewModule {}
