import {
  createInvitationSchema,
  invitationIdSchema,
  invitationTokenSchema,
  updateMemberRoleSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { adminProcedure, publicProcedure, router } from "../trpc/trpc.base.js";
import { MembersService } from "./members.service.js";

@Injectable()
export class MembersRouter {
  constructor(private readonly members: MembersService) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      list: adminProcedure.query(() => this.members.listMembers()),

      updateRole: adminProcedure.input(updateMemberRoleSchema).mutation(async ({ input }) => {
        await this.members.updateRole(input.userId, input.role);
        return { ok: true } as const;
      }),

      remove: adminProcedure
        .input(z.object({ userId: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
          await this.members.removeMember(ctx.session.user.id, input.userId);
          return { ok: true } as const;
        }),

      listInvitations: adminProcedure.query(() => this.members.listInvitations()),

      invite: adminProcedure
        .input(createInvitationSchema)
        .mutation(({ input, ctx }) => this.members.createInvitation(ctx.session.user.id, input)),

      resendInvitation: adminProcedure
        .input(z.object({ id: invitationIdSchema }))
        .mutation(({ input, ctx }) => this.members.resendInvitation(ctx.session.user.id, input.id)),

      revokeInvitation: adminProcedure
        .input(z.object({ id: invitationIdSchema }))
        .mutation(async ({ input }) => {
          await this.members.revokeInvitation(input.id);
          return { ok: true } as const;
        }),

      // Public: the invitation page and the login page run before anyone is
      // signed in. Both say only what the caller already needs to know.
      describeInvitation: publicProcedure
        .input(z.object({ token: invitationTokenSchema }))
        .query(({ input }) => this.members.describeInvitation(input.token)),

      signupOpen: publicProcedure.query(() => this.members.signupOpen()),
    });
  }
}
