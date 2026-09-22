import {
  addConfigurableOptionSchema,
  configurableOptionIdSchema,
  moveConfigurableOptionSchema,
  updateConfigurableOptionSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
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

      addOption: protectedProcedure
        .input(addConfigurableOptionSchema)
        .mutation(({ input }) => this.settings.addOption(input)),

      updateOption: protectedProcedure
        .input(updateConfigurableOptionSchema)
        .mutation(({ input }) => this.settings.updateOption(input)),

      moveOption: protectedProcedure
        .input(moveConfigurableOptionSchema)
        .mutation(({ input }) => this.settings.moveOption(input.id, input.direction)),

      removeOption: protectedProcedure
        .input(z.object({ id: configurableOptionIdSchema }))
        .mutation(async ({ input }) => {
          await this.settings.removeOption(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
