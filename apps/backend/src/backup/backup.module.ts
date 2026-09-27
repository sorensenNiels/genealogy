import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { NotificationModule } from "../notification/notification.module.js";
import { BackupController } from "./backup.controller.js";
import { BackupProcessor } from "./backup.processor.js";
import { BackupRouter } from "./backup.router.js";
import { BACKUP_QUEUE, BackupService } from "./backup.service.js";

@Module({
  imports: [BullModule.registerQueue({ name: BACKUP_QUEUE }), NotificationModule],
  controllers: [BackupController],
  providers: [BackupService, BackupProcessor, BackupRouter],
  exports: [BackupRouter],
})
export class BackupModule {}
