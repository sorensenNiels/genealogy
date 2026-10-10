import {
  addConfigurableOptionSchema,
  configurableOptionIdSchema,
  moveConfigurableOptionSchema,
  peopleListSettingsSchema,
  personSettingsSchema,
  recordSettingsSchema,
  treeSettingsSchema,
  updateConfigurableOptionSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { SettingsService } from "./settings.service.js";

@Injectable()
export class SettingsRouter {
  constructor(private readonly settings: SettingsService) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.settings` would still be undefined.
   */
  build() {
    return router({
      listOptions: protectedProcedure.query(() => this.settings.listOptions()),

      // Read by every member's tree page; only an admin changes them.
      treeSettings: protectedProcedure.query(() => this.settings.getTreeSettings()),

      updateTreeSettings: adminProcedure
        .input(treeSettingsSchema)
        .mutation(({ input }) => this.settings.updateTreeSettings(input)),

      // Read by every member's person page; only an admin changes them.
      personSettings: protectedProcedure.query(() => this.settings.getPersonSettings()),

      updatePersonSettings: adminProcedure
        .input(personSettingsSchema)
        .mutation(({ input }) => this.settings.updatePersonSettings(input)),

      // Read by every member (record pages, the person page's coverage);
      // only an admin changes them.
      recordSettings: protectedProcedure.query(() => this.settings.getRecordSettings()),

      updateRecordSettings: adminProcedure
        .input(recordSettingsSchema)
        .mutation(({ input }) => this.settings.updateRecordSettings(input)),

      // Read by every member's People list; only an admin changes them.
      peopleListSettings: protectedProcedure.query(() => this.settings.getPeopleListSettings()),

      updatePeopleListSettings: adminProcedure
        .input(peopleListSettingsSchema)
        .mutation(({ input }) => this.settings.updatePeopleListSettings(input)),

      addOption: adminProcedure
        .input(addConfigurableOptionSchema)
        .mutation(({ input }) => this.settings.addOption(input)),

      updateOption: adminProcedure
        .input(updateConfigurableOptionSchema)
        .mutation(({ input }) => this.settings.updateOption(input)),

      moveOption: adminProcedure
        .input(moveConfigurableOptionSchema)
        .mutation(({ input }) => this.settings.moveOption(input.id, input.direction)),

      removeOption: adminProcedure
        .input(z.object({ id: configurableOptionIdSchema }))
        .mutation(async ({ input }) => {
          await this.settings.removeOption(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
