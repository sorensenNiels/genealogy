import { Module } from "@nestjs/common";

import { PersonMergeService } from "./person-merge.service.js";
import { PersonPhotoController } from "./person-photo.controller.js";
import { PersonRouter } from "./person.router.js";
import { PersonService } from "./person.service.js";

@Module({
  controllers: [PersonPhotoController],
  providers: [PersonService, PersonMergeService, PersonRouter],
  exports: [PersonRouter],
})
export class PersonModule {}
