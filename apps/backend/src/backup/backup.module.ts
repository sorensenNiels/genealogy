import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { NotificationModule } from "../notification/notification.module.js";
import { BackupController } from "./backup.controller.js";
import { BackupProcessor } from "./backup.processor.js";
import { BackupRouter } from "./backup.router.js";
import { BACKUP_QUEUE, BackupService } from "./backup.service.js";
import { DbOperationLockService } from "./db-operation-lock.service.js";
import { RestoreProcessor } from "./restore.processor.js";
import { RESTORE_QUEUE, RestoreService } from "./restore.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: BACKUP_QUEUE }, { name: RESTORE_QUEUE }),
    NotificationModule,
  ],
  controllers: [BackupController],
  providers: [
    BackupService,
    BackupProcessor,
    BackupRouter,
    RestoreService,
    RestoreProcessor,
    DbOperationLockService,
  ],
  exports: [BackupRouter],
})
export class BackupModule {}
