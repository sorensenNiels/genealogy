import { Module } from "@nestjs/common";

import { BackupModule } from "../backup/backup.module.js";
import { GedcomModule } from "../gedcom/gedcom.module.js";
import { ImmichModule } from "../immich/immich.module.js";
import { IntegrityModule } from "../integrity/integrity.module.js";
import { MailModule } from "../mail/mail.module.js";
import { NotificationModule } from "../notification/notification.module.js";
import { PersonModule } from "../person/person.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { ResearchNoteModule } from "../research-note/research-note.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { SourceModule } from "../source/source.module.js";
import { UserNoteModule } from "../user-note/user-note.module.js";
import { TrpcRouter } from "./trpc.router.js";

@Module({
  imports: [
    PersonModule,
    SourceModule,
    SettingsModule,
    ImmichModule,
    ProfileModule,
    ResearchNoteModule,
    UserNoteModule,
    MailModule,
    NotificationModule,
    BackupModule,
    GedcomModule,
    IntegrityModule,
  ],
  providers: [TrpcRouter],
  exports: [TrpcRouter],
})
export class TrpcModule {}
