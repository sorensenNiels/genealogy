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
import { cn } from "@genealogy/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";

import { authClient, useSession } from "../lib/auth-client";
import { getPersonById, listPersons } from "../server/functions/person.functions";
import { getMyProfile, updateProfile } from "../server/functions/profile.functions";

const PROFILE_SECTIONS = ["account", "theme", "person"] as const;
type ProfileSection = (typeof PROFILE_SECTIONS)[number];
const SECTION_LABELS: Record<ProfileSection, string> = {
  account: "Account",
  theme: "Theme",
  person: "This is you",
};
const DEFAULT_SECTION: ProfileSection = PROFILE_SECTIONS[0];

export const Route = createFileRoute("/profile")({
  // An unrecognized/missing section (a stale bookmark, a typo'd URL) falls
  // back to the first one rather than erroring — same reasoning as
  // settings.tsx's topic search param.
  validateSearch: (search: Record<string, unknown>): { section?: ProfileSection } => {
    const section = PROFILE_SECTIONS.find((candidate) => candidate === search.section);
    return section ? { section } : {};
  },
  component: ProfileRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PersonRow = RouterOutputs["person"]["list"]["items"][number];

const MY_PROFILE_KEY = ["profile", "myProfile"];

function ProfileRoute() {
  const { section = DEFAULT_SECTION } = Route.useSearch();
  const { data: session, isPending: sessionPending } = useSession();
  const profile = useQuery({ queryKey: MY_PROFILE_KEY, queryFn: () => getMyProfile() });

  if (sessionPending || profile.isPending || !session || !profile.data) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <ProfileForm
        section={section}
        email={session.user.email}
        name={session.user.name}
        phoneNumber={profile.data.phoneNumber}
        personId={profile.data.personId}
      />
    </div>
  );
}

/**
 * One shared form (`name` + `phoneNumber`), but only one section renders at
 * a time, so each of Account/"This is you" gets its own Save/Cancel in its
 * own `footer` rather than one row shared across every section — Theme has
 * no footer at all, since it commits instantly (see `ThemePicker`).
 * "Change password" isn't part of the form either: it always starts blank,
 * so there's no clean/dirty baseline to save against — it stays its own
 * one-shot action, same reason login.tsx's sign-in/sign-up buttons are plain
 * too. Picking a person in "This is you" also stays instant-apply, for the
 * same reason as Theme.
 */
function ProfileForm({
  section,
  email,
  name,
  phoneNumber,
  personId,
}: {
  section: ProfileSection;
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
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <SectionCard title="Categories" titleClassName="text-base" className="h-fit">
          <nav className="flex flex-col gap-1">
            {PROFILE_SECTIONS.map((option) => (
              <Link
                key={option}
                to="/profile"
                search={{ section: option }}
                className={cn(
                  "rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  option === section && "border-primary bg-accent font-medium text-foreground",
                )}
              >
                {SECTION_LABELS[option]}
              </Link>
            ))}
          </nav>
        </SectionCard>

        {section === "account" && (
          <SectionCard
            title="Account"
            contentClassName="space-y-6"
            footerClassName="justify-end"
            footer={
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onPress={() => form.reset()}>
                  Cancel
                </Button>
                <SaveButton isDirty={isDirty} isPending={isSubmitting}>
                  Save
                </SaveButton>
              </div>
            }
          >
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
        )}

        {section === "theme" && (
          <SectionCard title="Theme">
            <ThemePicker />
          </SectionCard>
        )}

        {section === "person" && (
          <SectionCard
            title="This is you"
            contentClassName="space-y-6"
            footerClassName="justify-end"
            footer={
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onPress={() => form.reset()}>
                  Cancel
                </Button>
                <SaveButton isDirty={isDirty} isPending={isSubmitting}>
                  Save
                </SaveButton>
              </div>
            }
          >
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
        )}
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
