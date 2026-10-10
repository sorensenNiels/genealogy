import { Module } from "@nestjs/common";

import { RecordModule } from "../records/record.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { PersonMergeService } from "./person-merge.service.js";
import { PersonPhotoController } from "./person-photo.controller.js";
import { PersonRouter } from "./person.router.js";
import { PersonService } from "./person.service.js";

@Module({
  imports: [SettingsModule, RecordModule],
  controllers: [PersonPhotoController],
  providers: [PersonService, PersonMergeService, PersonRouter],
  exports: [PersonRouter],
})
export class PersonModule {}
