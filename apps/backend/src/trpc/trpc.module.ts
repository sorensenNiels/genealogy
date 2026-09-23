import { Module } from "@nestjs/common";

import { ImmichModule } from "../immich/immich.module.js";
import { PersonModule } from "../person/person.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { SourceModule } from "../source/source.module.js";
import { TrpcRouter } from "./trpc.router.js";

@Module({
  imports: [PersonModule, SourceModule, SettingsModule, ImmichModule],
  providers: [TrpcRouter],
  exports: [TrpcRouter],
})
export class TrpcModule {}
