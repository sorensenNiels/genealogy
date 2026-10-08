import { invitationTokenSchema } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "../lib/auth-client";
import { describeInvitation } from "../server/functions/members.functions";

/**
 * Where an invitation link lands — reachable without an account (see
 * `__root.tsx`'s `beforeLoad`). Creating the account here is what accepts the
 * invitation: better-auth's create hook checks the email has a pending
 * invitation and, for email/password, that `inviteToken` is this link's.
 */
export const Route = createFileRoute("/invite/$token")({
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === "string" ? { error: search.error } : {},
  component: InvitePage,
});

function InvitePage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const { error: oauthError } = Route.useSearch();
  const isWellFormed = invitationTokenSchema.safeParse(token).success;
  const invitation = useQuery({
    queryKey: ["members", "describeInvitation", token],
    queryFn: () => describeInvitation({ data: { token } }),
    enabled: isWellFormed,
  });

  if (isWellFormed && invitation.isPending) {
    return <p className="text-center text-sm text-muted-foreground">{t("invite.loading")}</p>;
  }

  const data = isWellFormed ? invitation.data : null;
  if (!data || data.status === "revoked" || data.status === "expired") {
    return (
      <Notice title={t("invite.unusableTitle")}>
        <p>{t("invite.unusable")}</p>
      </Notice>
    );
  }
  if (data.status === "accepted") {
    return (
      <Notice title={t("invite.acceptedTitle")}>
        <p>
          {t("invite.accepted")}{" "}
          <Link to="/login" className="underline">
            {t("login.signIn")}
          </Link>
        </p>
      </Notice>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <SectionCard
        title={t("invite.title", { name: data.inviterName ?? t("invite.someone") })}
        description={t("invite.asRole", { role: t(`members.role.${data.role}`) })}
        contentClassName="space-y-4"
      >
        {data.message && (
          <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
            {data.message}
          </blockquote>
        )}
        <SignUpForm token={token} email={data.email} />
        <div className="space-y-1">
          <Button
            variant="outline"
            className="w-full"
            onPress={() =>
              authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
                errorCallbackURL: `/invite/${token}`,
              })
            }
          >
            {t("login.continueWithGoogle")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("invite.googleHint", { email: data.email })}
          </p>
          {oauthError && <p className="text-sm text-destructive">{t("invite.googleRefused")}</p>}
        </div>
      </SectionCard>
    </div>
  );
}

function SignUpForm({ token, email }: { token: string; email: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        // `inviteToken` isn't one of better-auth's own sign-up fields — the
        // backend's create hook reads it from the request body.
        const result = await authClient.signUp.email({
          email,
          name: value.name.trim(),
          password: value.password,
          inviteToken: token,
        } as Parameters<typeof authClient.signUp.email>[0]);
        if (result.error) {
          setError(result.error.message ?? t("login.somethingWentWrong"));
          return;
        }
        await navigate({ to: "/" });
      } catch (caughtError) {
        console.error("Sign-up from invitation failed", caughtError);
        setError(t("login.requestFailed"));
      }
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <LabeledField label={t("login.email")} asDiv>
        <Input type="email" value={email} readOnly aria-label={t("login.email")} />
      </LabeledField>
      <form.Field name="name">
        {(field) => (
          <LabeledField label={t("login.name")} asDiv>
            <Input
              aria-label={t("login.name")}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </LabeledField>
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <LabeledField label={t("login.password")} asDiv>
            <Input
              type="password"
              aria-label={t("login.password")}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </LabeledField>
        )}
      </form.Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <form.Subscribe selector={(state) => [state.values.name, state.values.password] as const}>
        {([name, password]) => (
          <Button
            type="submit"
            className="w-full"
            isDisabled={name.trim() === "" || password.length < 8}
          >
            {t("invite.createAccount")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-sm">
      <SectionCard title={title} contentClassName="space-y-2 text-sm">
        {children}
      </SectionCard>
    </div>
  );
}
