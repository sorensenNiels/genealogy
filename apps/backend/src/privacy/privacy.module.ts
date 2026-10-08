import { Global, Module } from "@nestjs/common";

import { PersonRedactor } from "./person-redactor.js";

/** Global: nearly every feature router that returns person data needs the redactor. */
@Global()
@Module({
  providers: [PersonRedactor],
  exports: [PersonRedactor],
})
export class PrivacyModule {}
