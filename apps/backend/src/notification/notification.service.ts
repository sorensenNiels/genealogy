import type { NotificationType } from "@genealogy/core";
import { notifications, type Database, type NotificationRow } from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

export interface CreateNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  actionUrl?: string;
}

/**
 * System-generated, one-way notices — see the `notifications` table comment
 * in schema.ts. `MailService`-shaped: no queue awareness of its own, called
 * directly by whatever produces the event (`BackupProcessor`, so far) as
 * well as by `NotificationRouter`.
 */
@Injectable()
export class NotificationService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Most recent first, capped at 50 — this is a "what happened recently"
   * feed the frontend polls, not a full archive a user pages through.
   */
  async listNotifications(userId: string): Promise<NotificationRow[]> {
    return this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async create(input: CreateNotification): Promise<NotificationRow> {
    const [row] = await this.db.insert(notifications).values(input).returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  /** Scoped by `userId` in the `where` clause — same reasoning as `UserNoteService.updateNote`: someone else's notification just no-ops instead of leaking whether the id exists. */
  async markRead(userId: string, id: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }
}
