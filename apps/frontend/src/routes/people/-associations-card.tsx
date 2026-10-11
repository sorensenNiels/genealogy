import { AddButton } from "@genealogy/ui/components/add-button";
import { Badge } from "@genealogy/ui/components/badge";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Select } from "@genealogy/ui/components/select";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PersonPicker, type PersonListItem } from "../-person-picker";
import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { labelFor, optionsFor } from "../../lib/person-display";
import { usePersonName } from "../../lib/person-name";
import { addAssociation, removeAssociation } from "../../server/functions/association.functions";
import type {
  AssociationAppearanceRow,
  AssociationRow,
  ConfigurableOptionRow,
  PersonEventRow,
  PersonRow,
  UnionRow,
} from "./-types";

/** "Christening (20 Jun 1830)" — the event a role is tied to. */
function eventContextLabel(
  event: Pick<PersonEventRow, "eventType" | "label" | "date">,
  options: ConfigurableOptionRow[],
  language: ReturnType<typeof toSupportedLanguage>,
): string {
  const type = labelFor(options, "event_type", event.eventType);
  const date = formatDisplayDate(event.date, language);
  return `${event.label ? `${type}: ${event.label}` : type}${date ? ` (${date})` : ""}`;
}

function roleLabel(
  row: Pick<AssociationRow, "role" | "label">,
  options: ConfigurableOptionRow[],
): string {
  return row.role === "other" && row.label
    ? row.label
    : labelFor(options, "association_role", row.role);
}

/**
 * Witnesses, godparents and other people named in a role on this person's
 * records (GEDCOM's `ASSO`) — see `associationSchema` in packages/core —
 * plus, underneath, the other people's records this person appears in.
 * Add/remove only for now; editing a role means removing and re-adding it.
 */
export function AssociationsCard({
  personId,
  own,
  appearances,
  events,
  unions,
  spouses,
  options,
  onChanged,
}: {
  personId: string;
  own: AssociationRow[];
  appearances: AssociationAppearanceRow[];
  events: PersonEventRow[];
  unions: UnionRow[];
  spouses: PersonRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const removeMutation = useMutation({ mutationFn: removeAssociation });

  const remove = async (id: string) => {
    await removeMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  const contextLabel = (row: AssociationRow): string | null => {
    if (row.eventId) {
      const event = events.find((candidate) => candidate.id === row.eventId);
      return event ? eventContextLabel(event, options, language) : null;
    }
    if (row.unionId) {
      const union = unions.find((candidate) => candidate.id === row.unionId);
      return union ? unionContextLabel(union, personId, spouses, t, formatName) : null;
    }
    return null;
  };

  return (
    <SectionCard
      title={t("person.associations.title")}
      titleClassName="text-base"
      contentClassName="space-y-4"
      action={
        <FormDialog
          trigger={<AddButton label={t("person.associations.add")} />}
          title={t("person.associations.add")}
        >
          {(close) => (
            <AssociationForm
              personId={personId}
              events={events}
              unions={unions}
              spouses={spouses}
              options={options}
              onDone={async () => {
                close();
                await onChanged();
              }}
            />
          )}
        </FormDialog>
      }
    >
      {own.length === 0 && appearances.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("person.associations.empty")}</p>
      )}
      {own.map((row) => {
        const context = contextLabel(row);
        return (
          <div key={row.id} className="space-y-1 border-b pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{roleLabel(row, options)}</Badge>
                {row.associatePersonId ? (
                  <Link
                    to="/people/$personId"
                    params={{ personId: row.associatePersonId }}
                    className="text-primary hover:underline"
                  >
                    {formatName({
                      given: row.associateGiven ?? "",
                      surname: row.associateSurname ?? "",
                    })}
                  </Link>
                ) : (
                  <span>{row.associateName}</span>
                )}
                {context && (
                  <span className="text-muted-foreground">
                    {t("person.associations.at", { context })}
                  </span>
                )}
              </div>
              <RemoveButton
                itemLabel={t("person.associations.thisRole")}
                onConfirm={() => void remove(row.id)}
              />
            </div>
            {row.notes && <MarkdownContent className="text-sm">{row.notes}</MarkdownContent>}
          </div>
        );
      })}

      {appearances.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("person.associations.appearsIn")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {appearances.map((row) => {
              const owner = (
                <Link
                  to="/people/$personId"
                  params={{ personId: row.personId }}
                  className="text-primary hover:underline"
                >
                  {formatName({ given: row.ownerGiven, surname: row.ownerSurname })}
                </Link>
              );
              const context = row.eventType
                ? eventContextLabel(
                    { eventType: row.eventType, label: row.eventLabel, date: row.eventDate },
                    options,
                    language,
                  )
                : row.unionId
                  ? t("person.associations.marriage")
                  : null;
              return (
                <li key={row.id}>
                  {roleLabel(row, options)} — {owner}
                  {context && (
                    <span className="text-muted-foreground">
                      {" "}
                      {t("person.associations.at", { context })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function unionContextLabel(
  union: UnionRow,
  personId: string,
  spouses: PersonRow[],
  t: TFunction,
  formatName: (name: PersonRow) => string,
): string {
  const partnerId = union.personAId === personId ? union.personBId : union.personAId;
  const partner = spouses.find((candidate) => candidate.id === partnerId);
  return partner
    ? t("person.associations.marriageTo", { name: formatName(partner) })
    : t("person.associations.marriage");
}

/** `none` | `event|<id>` | `union|<id>` — one Select over both kinds of record a role can be tied to. */
type ContextKey = string;

function AssociationForm({
  personId,
  events,
  unions,
  spouses,
  options,
  onDone,
}: {
  personId: string;
  events: PersonEventRow[];
  unions: UnionRow[];
  spouses: PersonRow[];
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const addMutation = useMutation({ mutationFn: addAssociation });
  const roleOptions = optionsFor(options, "association_role");
  const [role, setRole] = useState(roleOptions[0]?.key ?? "other");
  const [label, setLabel] = useState("");
  const [context, setContext] = useState<ContextKey>("none");
  // Godparents and witnesses are often never added as people — "just a
  // name" is a first-class choice, not a fallback.
  const [mode, setMode] = useState<"person" | "name">("person");
  const [associate, setAssociate] = useState<PersonListItem | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const hasAssociate = mode === "person" ? associate !== null : name.trim() !== "";
  const needsLabel = role === "other" && label.trim() === "";
  // No TanStack Form here (same as `CitationForm`): "dirty" is simply having
  // picked someone or typed anything, measured against the empty start.
  const isDirty = hasAssociate || label !== "" || notes !== "" || context !== "none";

  const submit = async () => {
    const [kind, id] = context.split("|");
    await addMutation.mutateAsync({
      data: {
        personId,
        eventId: kind === "event" && id ? id : null,
        unionId: kind === "union" && id ? id : null,
        associatePersonId: mode === "person" ? (associate?.id ?? null) : null,
        associateName: mode === "name" ? name.trim() : null,
        role,
        label: role === "other" ? label.trim() : null,
        notes: notes.trim() === "" ? null : notes,
      },
    });
    await onDone();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <LabeledField label={t("person.associations.role")}>
        <Select
          aria-label={t("person.associations.role")}
          value={role}
          onValueChange={(value) => {
            if (value) setRole(String(value));
          }}
          options={roleOptions.map((option) => ({ value: option.key, label: option.label }))}
        />
      </LabeledField>
      {role === "other" && (
        <LabeledField label={t("person.associations.roleLabel")}>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
        </LabeledField>
      )}

      <LabeledField label={t("person.associations.record")}>
        <Select
          aria-label={t("person.associations.record")}
          value={context}
          onValueChange={(value) => {
            if (value) setContext(String(value));
          }}
          options={[
            { value: "none", label: t("person.associations.noRecord") },
            ...events.map((event) => ({
              value: `event|${event.id}`,
              label: eventContextLabel(event, options, language),
            })),
            ...unions.map((union) => ({
              value: `union|${union.id}`,
              label: unionContextLabel(union, personId, spouses, t, formatName),
            })),
          ]}
        />
      </LabeledField>

      <ButtonRadioGroup
        aria-label={t("person.associations.who")}
        value={mode}
        onValueChange={(value) => setMode(value === "name" ? "name" : "person")}
        options={[
          { value: "person", label: t("person.associations.someoneInTree") },
          { value: "name", label: t("person.associations.justAName") },
        ]}
      />
      {mode === "person" ? (
        <PersonPicker onSelect={setAssociate} excludeIds={new Set([personId])} />
      ) : (
        <Input
          aria-label={t("person.associations.nameAsWritten")}
          placeholder={t("person.associations.nameAsWritten")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      )}

      <MarkdownEditor aria-label={t("common.notes")} value={notes} onChange={setNotes} />
      {addMutation.isError && (
        <p className="text-sm text-destructive">{addMutation.error.message}</p>
      )}
      <DialogFooter>
        <SaveButton
          isDirty={isDirty}
          isPending={addMutation.isPending}
          disabled={!hasAssociate || needsLabel}
        >
          {t("common.add")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
