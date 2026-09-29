import { notificationIdSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { NotificationService } from "./notification.service.js";

@Injectable()
export class NotificationRouter {
  constructor(private readonly notifications: NotificationService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      list: protectedProcedure.query(({ ctx }) =>
        this.notifications.listNotifications(ctx.session.user.id),
      ),

      markRead: protectedProcedure
        .input(z.object({ id: notificationIdSchema }))
        .mutation(async ({ input, ctx }) => {
          await this.notifications.markRead(ctx.session.user.id, input.id);
          return { ok: true } as const;
        }),

      markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
        await this.notifications.markAllRead(ctx.session.user.id);
        return { ok: true } as const;
      }),

      delete: protectedProcedure
        .input(z.object({ id: notificationIdSchema }))
        .mutation(async ({ input, ctx }) => {
          await this.notifications.delete(ctx.session.user.id, input.id);
          return { ok: true } as const;
        }),

      deleteAll: protectedProcedure.mutation(async ({ ctx }) => {
        await this.notifications.deleteAll(ctx.session.user.id);
        return { ok: true } as const;
      }),
    });
  }
}
