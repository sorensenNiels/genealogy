import {
  lastTreeViewSchema,
  overviewPreferencesSchema,
  peopleListPreferencesChangeSchema,
  personIdSchema,
  updateProfileSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { ProfileService } from "./profile.service.js";

@Injectable()
export class ProfileRouter {
  constructor(private readonly profile: ProfileService) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.profile` would still be undefined.
   */
  build() {
    return router({
      // The first procedures in this app to read `ctx.session.user.id` —
      // every other router only uses `protectedProcedure` as an auth gate,
      // never the session contents themselves.
      myProfile: protectedProcedure.query(({ ctx }) =>
        this.profile.getMyProfile(ctx.session.user.id),
      ),

      updateProfile: protectedProcedure
        .input(updateProfileSchema)
        .mutation(({ input, ctx }) => this.profile.updateProfile(ctx.session.user.id, input)),

      // "Remember where I was" on the tree — each member's own, so any
      // signed-in member (Viewers too) may save theirs.
      lastTreeView: protectedProcedure.query(({ ctx }) =>
        this.profile.getLastTreeView(ctx.session.user.id),
      ),

      saveLastTreeView: protectedProcedure
        .input(lastTreeViewSchema)
        .mutation(async ({ input, ctx }) => {
          await this.profile.saveLastTreeView(ctx.session.user.id, input);
          return { ok: true } as const;
        }),

      // Every person page a member opens, for the Overview's "Continue where
      // you left off" — their own list, so any member (Viewers too) may.
      recordPersonView: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .mutation(async ({ input, ctx }) => {
          await this.profile.recordPersonView(ctx.session.user.id, input.personId);
          return { ok: true } as const;
        }),

      // The People list's table/card and compact/detailed choices — each
      // member's own, like the above.
      peopleListPreferences: protectedProcedure.query(({ ctx }) =>
        this.profile.getPeopleListPreferences(ctx.session.user.id),
      ),

      savePeopleListPreferences: protectedProcedure
        .input(peopleListPreferencesChangeSchema)
        .mutation(({ input, ctx }) =>
          this.profile.savePeopleListPreferences(ctx.session.user.id, input),
        ),

      // The Overview cards a member hides for themselves — any member, Viewers too.
      overviewPreferences: protectedProcedure.query(({ ctx }) =>
        this.profile.getOverviewPreferences(ctx.session.user.id),
      ),

      saveOverviewPreferences: protectedProcedure
        .input(overviewPreferencesSchema)
        .mutation(({ input, ctx }) =>
          this.profile.saveOverviewPreferences(ctx.session.user.id, input),
        ),
    });
  }
}
