import { Module } from "@nestjs/common";

import { AlbumCategoryModule } from "../album-category/album-category.module.js";
import { AssociationModule } from "../association/association.module.js";
import { BackupModule } from "../backup/backup.module.js";
import { DuplicateModule } from "../duplicate/duplicate.module.js";
import { ExternalIdModule } from "../external-id/external-id.module.js";
import { GedcomModule } from "../gedcom/gedcom.module.js";
import { ImmichModule } from "../immich/immich.module.js";
import { IntegrityModule } from "../integrity/integrity.module.js";
import { MailModule } from "../mail/mail.module.js";
import { MembersModule } from "../members/members.module.js";
import { NotificationModule } from "../notification/notification.module.js";
import { PersonModule } from "../person/person.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { RecordModule } from "../records/record.module.js";
import { ResearchNoteModule } from "../research-note/research-note.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { SourceModule } from "../source/source.module.js";
import { StaticSiteModule } from "../static-site/static-site.module.js";
import { ThemeModule } from "../theme/theme.module.js";
import { UserNoteModule } from "../user-note/user-note.module.js";
import { TrpcRouter } from "./trpc.router.js";

@Module({
  imports: [
    PersonModule,
    SourceModule,
    SettingsModule,
    ImmichModule,
    ProfileModule,
    ThemeModule,
    ResearchNoteModule,
    UserNoteModule,
    MailModule,
    NotificationModule,
    BackupModule,
    GedcomModule,
    IntegrityModule,
    DuplicateModule,
    AssociationModule,
    AlbumCategoryModule,
    ExternalIdModule,
    MembersModule,
    RecordModule,
    StaticSiteModule,
  ],
  providers: [TrpcRouter],
  exports: [TrpcRouter],
})
export class TrpcModule {}
