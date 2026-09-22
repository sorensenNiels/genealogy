import { Button } from "@genealogy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@genealogy/ui/components/card";
import { Input } from "@genealogy/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
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
          setError(result.error.message ?? "Something went wrong.");
          return;
        }
        await navigate({ to: "/" });
      } catch (caughtError) {
        // A network failure (including our own request timeout — see
        // lib/network-logging.ts) throws instead of resolving to
        // `{ error }`, so without this the button would just go quiet with
        // nothing but a console line to explain why.
        console.error("Sign-in/sign-up request failed", caughtError);
        setError("Request failed — check the browser console for details.");
      }
    },
  });

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "sign-in" ? "Sign in" : "Create an account"}</CardTitle>
          <CardDescription>
            {mode === "sign-in" ? "Welcome back." : "Start recording your family tree."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                    placeholder="Name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-label="Name"
                  />
                )}
              </form.Field>
            )}
            <form.Field name="email">
              {(field) => (
                <Input
                  type="email"
                  placeholder="Email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-label="Email"
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <Input
                  type="password"
                  placeholder="Password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-label="Password"
                />
              )}
            </form.Field>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full">
              {mode === "sign-in" ? "Sign in" : "Sign up"}
            </Button>
          </form>

          <Button
            variant="outline"
            className="w-full"
            onPress={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
          >
            Continue with Google
          </Button>

          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
            }}
          >
            {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
