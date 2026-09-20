import { Module } from "@nestjs/common";

import { PersonRouter } from "./person.router.js";
import { PersonService } from "./person.service.js";

@Module({
  providers: [PersonService, PersonRouter],
  exports: [PersonRouter],
})
export class PersonModule {}
