import { isAdmin, memberRoleSchema, type MemberRole } from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Select } from "@genealogy/ui/components/select";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { MailIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSession } from "../lib/auth-client";
import { useOptimisticMutation } from "../lib/optimistic";
import {
  inviteMember,
  listInvitations,
  listMembers,
  removeMember,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
} from "../server/functions/members.functions";
import { PersonPicker } from "./-person-picker";

export const Route = createFileRoute("/members")({
  // Admin-only (the backend enforces it too); anyone else goes home.
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.role)) throw redirect({ to: "/" });
  },
  component: MembersPage,
});

const MEMBERS_KEY = ["members", "list"];
type MemberRow = Awaited<ReturnType<typeof listMembers>>[number];
const INVITATIONS_KEY = ["members", "invitations"];

function MembersPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("members.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("members.subtitle")}</p>
      </div>
      <RoleLegend />
      <MembersCard />
      <InvitationsCard />
    </div>
  );
}

function RoleLegend() {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-3">
      {memberRoleSchema.options.map((role) => (
        <li key={role} className="rounded-md border bg-card p-3">
          <p className="font-medium">{t(`members.role.${role}`)}</p>
          <p className="text-muted-foreground">{t(`members.roleDescription.${role}`)}</p>
        </li>
      ))}
    </ul>
  );
}

function RoleSelect({
  value,
  onChange,
  label,
  isDisabled,
}: {
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  label: string;
  isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select
      aria-label={label}
      value={value}
      disabled={isDisabled ?? false}
      onValueChange={onChange}
      className="w-36"
      options={memberRoleSchema.options.map((role) => ({
        value: role,
        label: t(`members.role.${role}`),
      }))}
    />
  );
}

function MembersCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const members = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => listMembers() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
  // The new role shows at once and is put back if the change is refused
  // (e.g. demoting the last admin) — see `useOptimisticMutation`.
  const roleMutation = useOptimisticMutation({
    mutationFn: updateMemberRole,
    queryKey: MEMBERS_KEY,
    update: (cached: MemberRow[], { data }) =>
      cached.map((member) => (member.id === data.userId ? { ...member, role: data.role } : member)),
  });
  const removeMutation = useMutation({ mutationFn: removeMember, onSuccess: refresh });
  const error = roleMutation.error ?? removeMutation.error;

  return (
    <SectionCard
      title={t("members.membersTitle", { count: members.data?.length ?? 0 })}
      titleClassName="text-base"
      contentClassName="space-y-2"
    >
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <ul className="divide-y">
        {members.data?.map((member) => {
          const isSelf = member.id === session?.user.id;
          return (
            <li key={member.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {member.name}
                  {isSelf && (
                    <Badge variant="secondary" className="ml-2">
                      {t("members.you")}
                    </Badge>
                  )}
                </p>
                <p className="truncate text-muted-foreground">
                  {member.email}
                  {member.personName ? ` · ${member.personName}` : ""}
                </p>
              </div>
              <RoleSelect
                label={t("members.roleFor", { name: member.name })}
                value={member.role}
                isDisabled={roleMutation.isPending}
                onChange={(role) => roleMutation.mutate({ data: { userId: member.id, role } })}
              />
              {!isSelf && (
                <RemoveButton
                  itemLabel={member.name}
                  title={t("members.removeTitle", { name: member.name })}
                  description={t("members.removeDescription")}
                  actionLabel={t("common.remove")}
                  onConfirm={() => removeMutation.mutate({ data: { userId: member.id } })}
                  trigger={
                    <Button variant="ghost" size="sm" className="text-destructive">
                      {t("common.remove")}
                    </Button>
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function InvitationsCard() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const invitations = useQuery({ queryKey: INVITATIONS_KEY, queryFn: () => listInvitations() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
  const [lastLink, setLastLink] = useState<{
    email: string;
    link: string;
    emailSent: boolean;
  } | null>(null);
  const resendMutation = useMutation({ mutationFn: resendInvitation });
  const revokeMutation = useMutation({ mutationFn: revokeInvitation, onSuccess: refresh });
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });
  // Accepted ones are visible as members already; revoked ones are noise.
  const shown = (invitations.data ?? []).filter(
    (row) => row.status === "pending" || row.status === "expired",
  );

  return (
    <SectionCard
      title={t("members.invitationsTitle")}
      titleClassName="text-base"
      contentClassName="space-y-3"
      action={
        <FormDialog
          trigger={
            <Button size="sm">
              <UserPlusIcon /> {t("members.invite")}
            </Button>
          }
          title={t("members.inviteTitle")}
        >
          {(close) => (
            <InviteForm
              onDone={async (result) => {
                close();
                setLastLink(result);
                await refresh();
              }}
            />
          )}
        </FormDialog>
      }
    >
      {lastLink && <InvitationLink {...lastLink} onDismiss={() => setLastLink(null)} />}
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("members.noInvitations")}</p>
      )}
      <ul className="divide-y">
        {shown.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {row.email}{" "}
                <span className="font-normal text-muted-foreground">
                  · {t(`members.role.${row.role}`)}
                  {row.personName ? ` · ${row.personName}` : ""}
                </span>
              </p>
              <p className="text-muted-foreground">
                {row.status === "expired"
                  ? t("members.expired")
                  : t("members.expires", { date: dateFormat.format(new Date(row.expiresAt)) })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={resendMutation.isPending}
              onClick={() =>
                resendMutation.mutate(
                  { data: { id: row.id } },
                  {
                    onSuccess: async (result) => {
                      setLastLink({ email: row.email, ...result });
                      await refresh();
                    },
                  },
                )
              }
            >
              <MailIcon /> {t("members.resend")}
            </Button>
            <RemoveButton
              itemLabel={row.email}
              title={t("members.revokeTitle", { email: row.email })}
              description={t("members.revokeDescription")}
              actionLabel={t("members.revoke")}
              onConfirm={() => revokeMutation.mutate({ data: { id: row.id } })}
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  {t("members.revoke")}
                </Button>
              }
            />
          </li>
        ))}
      </ul>
      {(resendMutation.error ?? revokeMutation.error) && (
        <p className="text-sm text-destructive">
          {(resendMutation.error ?? revokeMutation.error)?.message}
        </p>
      )}
    </SectionCard>
  );
}

/** The link is only ever shown here, right after it's made — only its hash is stored. */
function InvitationLink({
  email,
  link,
  emailSent,
  onDismiss,
}: {
  email: string;
  link: string;
  emailSent: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
      <p>{emailSent ? t("members.linkSent", { email }) : t("members.linkNotSent", { email })}</p>
      <CopyableText value={link} className="font-mono text-xs break-all" />
      <p className="text-xs text-muted-foreground">{t("members.linkOnce")}</p>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t("members.dismiss")}
      </Button>
    </div>
  );
}

function InviteForm({
  onDone,
}: {
  onDone: (result: { email: string; link: string; emailSent: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const inviteMutation = useMutation({ mutationFn: inviteMember });

  const form = useForm({
    defaultValues: {
      email: "",
      role: "viewer" as MemberRole,
      personId: null as string | null,
      message: "",
    },
    onSubmit: async ({ value }) => {
      const message = value.message.trim();
      const result = await inviteMutation.mutateAsync({
        data: {
          email: value.email.trim(),
          role: value.role,
          personId: value.personId,
          message: message === "" ? null : message,
        },
      });
      await onDone({ email: value.email.trim().toLowerCase(), ...result });
    },
  });
  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const email = useStore(form.store, (state) => state.values.email);
  const role = useStore(form.store, (state) => state.values.role);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="email">
        {(field) => (
          <LabeledField label={t("members.email")} asDiv>
            <Input
              type="email"
              aria-label={t("members.email")}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </LabeledField>
        )}
      </form.Field>
      <LabeledField label={t("members.roleLabel")} asDiv>
        <RoleSelect
          label={t("members.roleLabel")}
          value={role}
          onChange={(next) => form.setFieldValue("role", next)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t(`members.roleDescription.${role}`)}</p>
      </LabeledField>
      <LabeledField label={t("members.whoInTree")} asDiv>
        <PersonPicker
          aria-label={t("members.whoInTree")}
          placeholder={t("members.whoInTreePlaceholder")}
          onSelect={(person) => form.setFieldValue("personId", person.id)}
        />
      </LabeledField>
      <form.Field name="message">
        {(field) => (
          <LabeledField label={t("members.message")} asDiv>
            <Input
              aria-label={t("members.message")}
              placeholder={t("members.messagePlaceholder")}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </LabeledField>
        )}
      </form.Field>
      {inviteMutation.isError && (
        <p className="text-sm text-destructive">{inviteMutation.error.message}</p>
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting} disabled={!email.includes("@")}>
          {t("members.send")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
