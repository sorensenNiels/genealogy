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
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient, useSession } from "../lib/auth-client";
import { getPersonById, listPersons } from "../server/functions/person.functions";
import { getMyProfile, updateProfile } from "../server/functions/profile.functions";

const PROFILE_SECTIONS = ["account", "theme", "language", "person"] as const;
type ProfileSection = (typeof PROFILE_SECTIONS)[number];
function sectionLabels(t: TFunction): Record<ProfileSection, string> {
  return {
    account: t("profile.sectionAccount"),
    theme: t("profile.sectionTheme"),
    language: t("profile.sectionLanguage"),
    person: t("profile.sectionPerson"),
  };
}
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
  const { t } = useTranslation();
  const { section = DEFAULT_SECTION } = Route.useSearch();
  const { data: session, isPending: sessionPending } = useSession();
  const profile = useQuery({ queryKey: MY_PROFILE_KEY, queryFn: () => getMyProfile() });

  if (sessionPending || profile.isPending || !session || !profile.data) {
    return <p className="text-muted-foreground">{t("profile.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
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
  const { t } = useTranslation();
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
        <SectionCard title={t("profile.categories")} titleClassName="text-base" className="h-fit">
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
                {sectionLabels(t)[option]}
              </Link>
            ))}
          </nav>
        </SectionCard>

        {section === "account" && (
          <SectionCard
            title={t("profile.sectionAccount")}
            contentClassName="space-y-6"
            footerClassName="justify-end"
            footer={
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onPress={() => form.reset()}>
                  {t("common.cancel")}
                </Button>
                <SaveButton isDirty={isDirty} isPending={isSubmitting}>
                  {t("common.save")}
                </SaveButton>
              </div>
            }
          >
            <LabeledField label={t("profile.email")} asDiv>
              <p className="text-sm">{email}</p>
            </LabeledField>
            <form.Field name="name">
              {(field) => (
                <LabeledField label={t("profile.displayName")}>
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
          <SectionCard title={t("profile.theme")}>
            <ThemePicker />
          </SectionCard>
        )}

        {section === "language" && (
          <SectionCard title={t("profile.sectionLanguage")}>
            <LanguagePicker />
          </SectionCard>
        )}

        {section === "person" && (
          <SectionCard
            title={t("profile.sectionPerson")}
            contentClassName="space-y-6"
            footerClassName="justify-end"
            footer={
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onPress={() => form.reset()}>
                  {t("common.cancel")}
                </Button>
                <SaveButton isDirty={isDirty} isPending={isSubmitting}>
                  {t("common.save")}
                </SaveButton>
              </div>
            }
          >
            <form.Field name="phoneNumber">
              {(field) => (
                <LabeledField label={t("profile.phoneNumber")}>
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
              <p className="text-sm text-muted-foreground">{t("profile.whoYouAre")}</p>
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
  const { t } = useTranslation();
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
        setPasswordError(result.error.message ?? t("profile.somethingWentWrong"));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSaved(true);
    } catch (caughtError) {
      console.error("Change password request failed", caughtError);
      setPasswordError(t("profile.requestFailed"));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("profile.changePassword")}</p>
      <Input
        type="password"
        placeholder={t("profile.currentPassword")}
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <Input
        type="password"
        placeholder={t("profile.newPassword")}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
      {passwordSaved && (
        <p className="text-sm text-muted-foreground">{t("profile.passwordUpdated")}</p>
      )}
      <Button
        type="button"
        isDisabled={changingPassword || currentPassword === "" || newPassword === ""}
        onPress={() => void changePassword()}
      >
        {changingPassword ? t("profile.saving") : t("profile.changePassword")}
      </Button>
    </div>
  );
}

function ThemePicker() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <ButtonRadioGroup
      aria-label={t("profile.theme")}
      value={preference ?? "system"}
      onChange={(value) => setPreference(value === "system" ? null : value)}
      options={[
        { value: "light", label: t("profile.themeLight") },
        { value: "dark", label: t("profile.themeDark") },
        { value: "system", label: t("profile.themeSystem") },
      ]}
    />
  );
}

/**
 * Instant-apply, same reasoning as `ThemePicker` — no Save/Cancel baseline
 * to diff against. `i18n.language` (not a separately-tracked `useState`) is
 * the single source of truth here: it's already seeded from the account's
 * saved preference at SSR time (see `__root.tsx`'s `beforeLoad`), so reading
 * it back avoids a second, possibly-stale copy of the same value.
 * `changeLanguage` re-renders every `useTranslation()` consumer in the tree
 * immediately; `updateProfile` persists it to the account (and refreshes the
 * `lang` cookie the backend-error-translation link reads) in the background.
 */
function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const updateProfileMutation = useMutation({ mutationFn: updateProfile });

  return (
    <ButtonRadioGroup
      aria-label={t("profile.language")}
      value={i18n.language === "da" ? "da" : "en"}
      onChange={(value) => {
        void i18n.changeLanguage(value);
        updateProfileMutation.mutate({ data: { language: value } });
      }}
      options={[
        { value: "en", label: t("profile.languageEnglish") },
        { value: "da", label: t("profile.languageDanish") },
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
  const { t } = useTranslation();
  const person = useQuery({
    queryKey: ["person", "byId", personId],
    queryFn: () => getPersonById({ data: { id: personId } }),
  });

  if (person.isPending) {
    return <p className="text-sm text-muted-foreground">{t("profile.loading")}</p>;
  }
  if (person.isError) {
    return (
      <p className="text-sm text-destructive">
        {t("profile.couldNotLoad", { message: person.error.message })}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm">
        {formatPersonName(person.data)}
        {formatLifespan(person.data) ? ` (${formatLifespan(person.data)})` : ""}
      </p>
      <Button variant="outline" size="sm" isDisabled={isPending} onPress={onUnlink}>
        {t("profile.change")}
      </Button>
    </div>
  );
}

function PersonPicker({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useTranslation();
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
      aria-label={t("profile.searchPeople")}
      items={options}
      inputValue={query}
      onInputChange={setQuery}
      onChange={(value) => {
        const target = options.find((candidate) => candidate.id === value);
        if (target) onPick(target.id);
      }}
    >
      <ComboboxInput placeholder={t("person.family.searchPeople")} />
      <ComboboxContent<PersonRow>
        renderEmptyState={() => <ComboboxEmpty>{t("person.family.noMatches")}</ComboboxEmpty>}
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
