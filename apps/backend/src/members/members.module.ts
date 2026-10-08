import { Module } from "@nestjs/common";

import { MailModule } from "../mail/mail.module.js";
import { MembersRouter } from "./members.router.js";
import { MembersService } from "./members.service.js";

@Module({
  imports: [MailModule],
  providers: [MembersService, MembersRouter],
  exports: [MembersRouter],
})
export class MembersModule {}
