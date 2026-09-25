import { updateProfileSchema } from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";

import { trpcProxy } from "../trpc-proxy-client";

export const getMyProfile = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.profile.myProfile.query(),
);

export const updateProfile = createServerFn({ method: "POST" })
  .validator(updateProfileSchema)
  .handler(({ data }) => trpcProxy.profile.updateProfile.mutate(data));
