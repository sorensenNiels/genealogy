import { Module } from "@nestjs/common";

import { ImmichModule } from "../immich/immich.module.js";
import { PersonModule } from "../person/person.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { ResearchNoteModule } from "../research-note/research-note.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { SourceModule } from "../source/source.module.js";
import { TrpcRouter } from "./trpc.router.js";

@Module({
  imports: [
    PersonModule,
    SourceModule,
    SettingsModule,
    ImmichModule,
    ProfileModule,
    ResearchNoteModule,
  ],
  providers: [TrpcRouter],
  exports: [TrpcRouter],
})
export class TrpcModule {}
