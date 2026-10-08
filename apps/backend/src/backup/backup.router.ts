import { Injectable } from "@nestjs/common";

import { adminProcedure, router } from "../trpc/trpc.base.js";
import { BackupService } from "./backup.service.js";

@Injectable()
export class BackupRouter {
  constructor(private readonly backups: BackupService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      create: adminProcedure.mutation(async ({ ctx }) => {
        await this.backups.enqueueBackup(ctx.session.user.id);
        return { queued: true } as const;
      }),
    });
  }
}
