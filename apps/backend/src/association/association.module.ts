import { Module } from "@nestjs/common";

import { AssociationRouter } from "./association.router.js";
import { AssociationService } from "./association.service.js";

@Module({
  providers: [AssociationService, AssociationRouter],
  exports: [AssociationRouter],
})
export class AssociationModule {}
