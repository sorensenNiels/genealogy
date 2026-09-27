import { Module } from "@nestjs/common";

import { NotificationRouter } from "./notification.router.js";
import { NotificationService } from "./notification.service.js";

@Module({
  providers: [NotificationService, NotificationRouter],
  exports: [NotificationRouter, NotificationService],
})
export class NotificationModule {}
