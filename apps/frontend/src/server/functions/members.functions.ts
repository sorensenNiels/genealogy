import {
  createInvitationSchema,
  invitationIdSchema,
  invitationTokenSchema,
  updateMemberRoleSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const listMembers = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.members.list.query(),
);

export const updateMemberRole = createServerFn({ method: "POST" })
  .validator(updateMemberRoleSchema)
  .handler(({ data }) => trpcProxy.members.updateRole.mutate(data));

export const removeMember = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(({ data }) => trpcProxy.members.remove.mutate(data));

export const listInvitations = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.members.listInvitations.query(),
);

export const inviteMember = createServerFn({ method: "POST" })
  .validator(createInvitationSchema)
  .handler(({ data }) => trpcProxy.members.invite.mutate(data));

export const resendInvitation = createServerFn({ method: "POST" })
  .validator(z.object({ id: invitationIdSchema }))
  .handler(({ data }) => trpcProxy.members.resendInvitation.mutate(data));

export const revokeInvitation = createServerFn({ method: "POST" })
  .validator(z.object({ id: invitationIdSchema }))
  .handler(({ data }) => trpcProxy.members.revokeInvitation.mutate(data));

/** Public — the invitation page runs before its visitor has an account. */
export const describeInvitation = createServerFn({ method: "GET" })
  .validator(z.object({ token: invitationTokenSchema }))
  .handler(({ data }) => trpcProxy.members.describeInvitation.query(data));

/** Public — whether the login page should offer sign-up (only on a brand-new install). */
export const getSignupOpen = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.members.signupOpen.query(),
);
