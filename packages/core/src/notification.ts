import { z } from "zod";

/**
 * A real enum, not a `configurableOptions` topic — same reasoning as
 * `genderSchema`: the frontend branches on the exact value (which icon to
 * show, what the action button says), so it's structural rather than an
 * admin-editable list. Grows by a code change on both ends anyway, since
 * something has to produce a new type and something has to render it.
 */
export const notificationTypeSchema = z.enum([
  "backup_ready",
  "immich_faces_rescanned",
  "restore_complete",
  "album_zip_ready",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationIdSchema = z.uuid();
export type NotificationId = z.infer<typeof notificationIdSchema>;
