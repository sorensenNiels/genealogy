import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { MailProcessor } from "./mail.processor.js";
import { MailRouter } from "./mail.router.js";
import { MAIL_QUEUE, MailService } from "./mail.service.js";

@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailService, MailProcessor, MailRouter],
  exports: [MailRouter, MailService],
})
export class MailModule {}
