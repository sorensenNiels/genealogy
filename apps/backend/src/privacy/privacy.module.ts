import { Global, Module } from "@nestjs/common";

import { SettingsModule } from "../settings/settings.module.js";
import { PersonRedactor } from "./person-redactor.js";

/** Global: nearly every feature router that returns person data needs the redactor. */
@Global()
@Module({
  // The person settings say how much of a living person a Viewer sees.
  imports: [SettingsModule],
  providers: [PersonRedactor],
  exports: [PersonRedactor],
})
export class PrivacyModule {}
