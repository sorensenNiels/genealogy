import {
  addConfigurableOptionSchema,
  configurableOptionIdSchema,
  moveConfigurableOptionSchema,
  personSettingsSchema,
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
