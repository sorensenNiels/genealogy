import { sendMailSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";

import { adminProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { MailService } from "./mail.service.js";

@Injectable()
export class MailRouter {
  constructor(private readonly mail: MailService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      isConfigured: protectedProcedure.query(() => this.mail.isConfigured()),

      send: adminProcedure.input(sendMailSchema).mutation(async ({ input }) => {
        await this.mail.enqueueMail(input);
        return { queued: true } as const;
      }),
    });
  }
}
