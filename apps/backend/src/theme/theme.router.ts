import { createThemeSchema, themeIdSchema, updateThemeSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { adminProcedure, protectedProcedure, publicProcedure, router } from "../trpc/trpc.base.js";
import { ThemeService } from "./theme.service.js";

@Injectable()
export class ThemeRouter {
  constructor(private readonly themes: ThemeService) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.themes` would still be undefined.
   */
  build() {
    return router({
      // Public: the sign-in page wears the family's theme too. Only colors,
      // fonts and a name — nothing about the tree.
      active: publicProcedure.query(({ ctx }) => this.themes.active(ctx.session?.user.id ?? null)),

      state: protectedProcedure.query(({ ctx }) => this.themes.state(ctx.session.user.id)),

      setMine: protectedProcedure
        .input(z.object({ id: themeIdSchema.nullable() }))
        .mutation(async ({ input, ctx }) => {
          await this.themes.setMine(ctx.session.user.id, input.id);
          return { ok: true } as const;
        }),

      setSiteDefault: adminProcedure
        .input(z.object({ id: themeIdSchema }))
        .mutation(async ({ input }) => {
          await this.themes.setSiteDefault(input.id);
          return { ok: true } as const;
        }),

      create: adminProcedure
        .input(createThemeSchema)
        .mutation(({ input, ctx }) => this.themes.create(input, ctx.session.user.id)),

      update: adminProcedure
        .input(updateThemeSchema)
        .mutation(({ input }) => this.themes.update(input.id, input.definition)),

      remove: adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ input }) => {
        await this.themes.remove(input.id);
        return { ok: true } as const;
      }),
    });
  }
}
