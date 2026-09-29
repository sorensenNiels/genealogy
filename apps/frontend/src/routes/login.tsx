import { Button } from "@genealogy/ui/components/button";
import { Input } from "@genealogy/ui/components/input";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const result =
          mode === "sign-in"
            ? await authClient.signIn.email({ email: value.email, password: value.password })
            : await authClient.signUp.email(value);
        if (result.error) {
          // better-auth's own error text — a separate auth flow from the
          // tRPC error-translation link, so it stays English for now; see
          // "Internationalization" in FEATURES.md for what's in scope.
          setError(result.error.message ?? t("login.somethingWentWrong"));
          return;
        }
        await navigate({ to: "/" });
      } catch (caughtError) {
        // A network failure (including our own request timeout — see
        // lib/network-logging.ts) throws instead of resolving to
        // `{ error }`, so without this the button would just go quiet with
        // nothing but a console line to explain why.
        console.error("Sign-in/sign-up request failed", caughtError);
        setError(t("login.requestFailed"));
      }
    },
  });

  return (
    <div className="mx-auto max-w-sm">
      <SectionCard
        title={mode === "sign-in" ? t("login.signIn") : t("login.createAccount")}
        description={mode === "sign-in" ? t("login.welcomeBack") : t("login.startRecording")}
        contentClassName="space-y-4"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          {mode === "sign-up" && (
            <form.Field name="name">
              {(field) => (
                <Input
                  placeholder={t("login.name")}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-label={t("login.name")}
                />
              )}
            </form.Field>
          )}
          <form.Field name="email">
            {(field) => (
              <Input
                type="email"
                placeholder={t("login.email")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-label={t("login.email")}
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <Input
                type="password"
                placeholder={t("login.password")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-label={t("login.password")}
              />
            )}
          </form.Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full">
            {mode === "sign-in" ? t("login.signIn") : t("login.signUp")}
          </Button>
        </form>

        <Button
          variant="outline"
          className="w-full"
          onPress={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
        >
          {t("login.continueWithGoogle")}
        </Button>

        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
        >
          {mode === "sign-in" ? t("login.needAccount") : t("login.haveAccount")}
        </button>
      </SectionCard>
    </div>
  );
}
