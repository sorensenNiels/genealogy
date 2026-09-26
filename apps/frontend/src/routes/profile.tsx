import type { AppRouter } from "@genealogy/backend";
import { formatLifespan, formatPersonName } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useTheme } from "@genealogy/ui/hooks/use-theme";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";

import { authClient, useSession } from "../lib/auth-client";
import { getPersonById, listPersons } from "../server/functions/person.functions";
import { getMyProfile, updateProfile } from "../server/functions/profile.functions";

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PersonRow = RouterOutputs["person"]["list"]["items"][number];

const MY_PROFILE_KEY = ["profile", "myProfile"];

function ProfileRoute() {
  const { data: session, isPending: sessionPending } = useSession();
  const profile = useQuery({ queryKey: MY_PROFILE_KEY, queryFn: () => getMyProfile() });

  if (sessionPending || profile.isPending || !session || !profile.data) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account, and who you are in the tree.</p>
      </div>
      <ProfileForm
        email={session.user.email}
        name={session.user.name}
        phoneNumber={profile.data.phoneNumber}
        personId={profile.data.personId}
      />
    </div>
  );
}

/**
 * One form, one Save button, spanning all three `SectionCard`s below (the
 * button itself lives outside them, not in any one card's own footer).
 * "Change password" isn't part of it: it always starts
 * blank, so there's no clean/dirty baseline to save against — it stays its
 * own one-shot action, same reason login.tsx's sign-in/sign-up buttons are
 * plain too. Picking a person in "Who you are in the tree" also stays
 * instant-apply, like the Theme control — both commit immediately rather
 * than waiting on this Save button.
 */
function ProfileForm({
  email,
  name,
  phoneNumber,
  personId,
}: {
  email: string;
  name: string;
  phoneNumber: string | null;
  personId: string | null;
}) {
  const queryClient = useQueryClient();
  const updateProfileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_PROFILE_KEY });
    },
  });

  const form = useForm({
    defaultValues: { name, phoneNumber: phoneNumber ?? "" },
    onSubmit: async ({ value, formApi }) => {
      await Promise.all([
        authClient.updateUser({ name: value.name.trim() }),
        updateProfileMutation.mutateAsync({
          data: { phoneNumber: value.phoneNumber.trim() === "" ? null : value.phoneNumber.trim() },
        }),
      ]);
      formApi.reset(value);
    },
  });
  const { isDirty, isSubmitting } = useFormDirtyPending(form);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SectionCard title="Account" contentClassName="space-y-6">
        <LabeledField label="Email" asDiv>
          <p className="text-sm">{email}</p>
        </LabeledField>
        <form.Field name="name">
          {(field) => (
            <LabeledField label="Display name">
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </LabeledField>
          )}
        </form.Field>
        <div className="border-t pt-4">
          <ChangePassword />
        </div>
      </SectionCard>

      <SectionCard title="Theme">
        <ThemePicker />
      </SectionCard>

      <SectionCard title="This is you" contentClassName="space-y-6">
        <form.Field name="phoneNumber">
          {(field) => (
            <LabeledField label="Phone number">
              <Input
                type="tel"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </LabeledField>
          )}
        </form.Field>
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm text-muted-foreground">Who you are in the tree</p>
          {personId ? (
            <LinkedPerson
              personId={personId}
              onUnlink={() => updateProfileMutation.mutate({ data: { personId: null } })}
              isPending={updateProfileMutation.isPending}
            />
          ) : (
            <PersonPicker
              onPick={(id) => updateProfileMutation.mutate({ data: { personId: id } })}
            />
          )}
          {updateProfileMutation.isError && (
            <p className="text-sm text-destructive">{updateProfileMutation.error.message}</p>
          )}
        </div>
      </SectionCard>

      <div className="flex items-center gap-2">
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          Save
        </SaveButton>
        <Button type="button" variant="outline" onPress={() => form.reset()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const changePassword = async () => {
    setPasswordError(null);
    setPasswordSaved(false);
    setChangingPassword(true);
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword });
      if (result.error) {
        setPasswordError(result.error.message ?? "Something went wrong.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSaved(true);
    } catch (caughtError) {
      console.error("Change password request failed", caughtError);
      setPasswordError("Request failed — check the browser console for details.");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Change password</p>
      <Input
        type="password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <Input
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
      {passwordSaved && <p className="text-sm text-muted-foreground">Password updated.</p>}
      <Button
        type="button"
        isDisabled={changingPassword || currentPassword === "" || newPassword === ""}
        onPress={() => void changePassword()}
      >
        {changingPassword ? "Saving…" : "Change password"}
      </Button>
    </div>
  );
}

function ThemePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <ButtonRadioGroup
      aria-label="Theme"
      value={preference ?? "system"}
      onChange={(value) => setPreference(value === "system" ? null : value)}
      options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
        { value: "system", label: "System" },
      ]}
    />
  );
}

function LinkedPerson({
  personId,
  onUnlink,
  isPending,
}: {
  personId: string;
  onUnlink: () => void;
  isPending: boolean;
}) {
  const person = useQuery({
    queryKey: ["person", "byId", personId],
    queryFn: () => getPersonById({ data: { id: personId } }),
  });

  if (person.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (person.isError) {
    return <p className="text-sm text-destructive">Could not load: {person.error.message}</p>;
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm">
        {formatPersonName(person.data)}
        {formatLifespan(person.data) ? ` (${formatLifespan(person.data)})` : ""}
      </p>
      <Button variant="outline" size="sm" isDisabled={isPending} onPress={onUnlink}>
        Change
      </Button>
    </div>
  );
}

function PersonPicker({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
  });
  const options = search.data?.items ?? [];

  return (
    <Combobox<PersonRow>
      aria-label="Search people"
      items={options}
      inputValue={query}
      onInputChange={setQuery}
      onChange={(value) => {
        const target = options.find((candidate) => candidate.id === value);
        if (target) onPick(target.id);
      }}
    >
      <ComboboxInput placeholder="Search people…" />
      <ComboboxContent<PersonRow>
        renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
      >
        {(item) => (
          <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
            {formatPersonName(item)}
            {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
          </ComboboxItem>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
