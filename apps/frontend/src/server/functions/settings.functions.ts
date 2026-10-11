import {
  addConfigurableOptionSchema,
  configurableOptionIdSchema,
  moveConfigurableOptionSchema,
  overviewSettingsSchema,
  peopleListSettingsSchema,
  personSettingsSchema,
  recordSettingsSchema,
  treeSettingsSchema,
  updateConfigurableOptionSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listOptions = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.settings.listOptions.query(),
);

export const getTreeSettings = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.settings.treeSettings.query(),
);

export const updateTreeSettings = createServerFn({ method: "POST" })
  .validator(treeSettingsSchema)
  .handler(({ data }) => trpcProxy.settings.updateTreeSettings.mutate(data));

export const getPersonSettings = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.settings.personSettings.query(),
);

export const updatePersonSettings = createServerFn({ method: "POST" })
  .validator(personSettingsSchema)
  .handler(({ data }) => trpcProxy.settings.updatePersonSettings.mutate(data));

export const getRecordSettings = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.settings.recordSettings.query(),
);

export const updateRecordSettings = createServerFn({ method: "POST" })
  .validator(recordSettingsSchema)
  .handler(({ data }) => trpcProxy.settings.updateRecordSettings.mutate(data));

export const addOption = createServerFn({ method: "POST" })
  .validator(addConfigurableOptionSchema)
  .handler(({ data }) => trpcProxy.settings.addOption.mutate(data));

export const updateOption = createServerFn({ method: "POST" })
  .validator(updateConfigurableOptionSchema)
  .handler(({ data }) => trpcProxy.settings.updateOption.mutate(data));

export const moveOption = createServerFn({ method: "POST" })
  .validator(moveConfigurableOptionSchema)
  .handler(({ data }) => trpcProxy.settings.moveOption.mutate(data));

export const removeOption = createServerFn({ method: "POST" })
  .validator(z.object({ id: configurableOptionIdSchema }))
  .handler(({ data }) => trpcProxy.settings.removeOption.mutate(data));

export const getPeopleListSettings = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.settings.peopleListSettings.query(),
);

export const updatePeopleListSettings = createServerFn({ method: "POST" })
  .validator(peopleListSettingsSchema)
  .handler(({ data }) => trpcProxy.settings.updatePeopleListSettings.mutate(data));

export const getOverviewSettings = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.settings.overviewSettings.query(),
);

export const updateOverviewSettings = createServerFn({ method: "POST" })
  .validator(overviewSettingsSchema)
  .handler(({ data }) => trpcProxy.settings.updateOverviewSettings.mutate(data));
