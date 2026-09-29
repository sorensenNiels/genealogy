import { notificationIdSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listNotifications = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.notification.list.query(),
);

export const markNotificationRead = createServerFn({ method: "POST" })
  .validator(z.object({ id: notificationIdSchema }))
  .handler(({ data }) => trpcProxy.notification.markRead.mutate(data));

export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(() =>
  trpcProxy.notification.markAllRead.mutate(),
);

export const deleteNotification = createServerFn({ method: "POST" })
  .validator(z.object({ id: notificationIdSchema }))
  .handler(({ data }) => trpcProxy.notification.delete.mutate(data));

export const deleteAllNotifications = createServerFn({ method: "POST" }).handler(() =>
  trpcProxy.notification.deleteAll.mutate(),
);
