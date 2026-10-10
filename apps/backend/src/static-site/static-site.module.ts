import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { NotificationModule } from "../notification/notification.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { ThemeModule } from "../theme/theme.module.js";
import { StaticSiteController } from "./static-site.controller.js";
import { StaticSiteProcessor } from "./static-site.processor.js";
import { StaticSiteRouter } from "./static-site.router.js";
import { STATIC_SITE_QUEUE, StaticSiteService } from "./static-site.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: STATIC_SITE_QUEUE }),
    NotificationModule,
    SettingsModule,
    ThemeModule,
  ],
  controllers: [StaticSiteController],
  providers: [StaticSiteService, StaticSiteProcessor, StaticSiteRouter],
  exports: [StaticSiteRouter],
})
export class StaticSiteModule {}
