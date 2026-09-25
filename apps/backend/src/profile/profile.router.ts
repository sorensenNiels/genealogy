import { updateProfileSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";

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
    });
  }
}
