import { formatLifespan, parentageSchema, type Parentage } from "@genealogy/core";
import { AddButton } from "@genealogy/ui/components/add-button";
import { Button } from "@genealogy/ui/components/button";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { Select } from "@genealogy/ui/components/select";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PersonPicker } from "../-person-picker";
import { optionsFor } from "../../lib/person-display";
import { usePersonName } from "../../lib/person-name";
import { createPerson, linkParent } from "../../server/functions/person.functions";
import type { ConfigurableOptionRow, ParentRow, PersonRow, SiblingRow } from "./-types";

/**
 * Siblings aren't a direct edge the way Parents/Spouses/Children each are —
 * "sibling" just means sharing one of this person's own parents, so there's
 * no single edge here to remove. Read-only plus Add, then: closing a sibling
 * relationship means editing that shared parent's own children (already
 * possible from that parent's own Family card), not a duplicate destructive
 * action here.
 */
export function SiblingsSection({
  siblings,
  parents,
  excludeIds,
  options,
  onChanged,
}: {
  siblings: SiblingRow[];
  parents: ParentRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("person.family.siblings")}</span>
        {parents.length > 0 && (
          <AddSibling
            parents={parents}
            excludeIds={excludeIds}
            options={options}
            onChanged={onChanged}
          />
        )}
      </div>
      {parents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("person.family.addParentFirst")}</p>
      ) : (
        <div className="space-y-2">
          {siblings.map((sibling) => (
            <Link
              key={sibling.id}
              to="/people/$personId"
              params={{ personId: sibling.id }}
              className="block text-sm hover:underline"
            >
              {formatName(sibling)}
              {formatLifespan(sibling) && (
                <span className="ml-1 text-muted-foreground">({formatLifespan(sibling)})</span>
              )}
              {/* Only shown at all when Settings → Person page includes half-siblings. */}
              {sibling.half && (
                <span className="ml-1 text-xs text-muted-foreground">
                  · {t("person.family.halfSibling")}
                </span>
              )}
            </Link>
          ))}
          {siblings.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("person.family.noSiblings")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Adding a sibling really means linking a person as a *child of one of this
 * person's own parents* — there's no direct edge between siblings the way
 * there is for Parents/Spouses/Children. With two recorded parents, which
 * one(s) to attach to is a real choice (both = full sibling, one = half),
 * so that's a small picker here rather than assumed; with exactly one
 * parent there's nothing to choose, so it's skipped.
 */
function AddSibling({
  parents,
  excludeIds,
  options,
  onChanged,
}: {
  parents: ParentRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const [mode, setMode] = useState<"search" | "create">("search");
  const [parentage, setParentage] = useState<Parentage>("unknown");
  const [selectedParentIds, setSelectedParentIds] = useState<Set<string>>(
    () => new Set(parents.map((parent) => parent.id)),
  );

  const createPersonMutation = useMutation({ mutationFn: createPerson });
  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const canSubmit = selectedParentIds.size > 0;

  const linkToSelectedParents = (childId: string) =>
    Promise.all(
      [...selectedParentIds].map((parentId) =>
        linkParentMutation.mutateAsync({ data: { parentId, childId, parentage } }),
      ),
    );

  const link = async (target: PersonRow, close: () => void) => {
    await linkToSelectedParents(target.id);
    close();
    await onChanged();
  };

  const createAndLink = async (value: { given: string; surname: string }, close: () => void) => {
    const created = await createPersonMutation.mutateAsync({ data: value });
    await linkToSelectedParents(created.id);
    close();
    await onChanged();
  };

  const parentPicker = parents.length > 1 && (
    <LabeledField label={t("person.family.sharedParents")} asDiv>
      {parents.map((parent) => (
        <Checkbox
          key={parent.id}
          checked={selectedParentIds.has(parent.id)}
          onCheckedChange={(checked) => {
            setSelectedParentIds((previous) => {
              const next = new Set(previous);
              if (checked) {
                next.add(parent.id);
              } else {
                next.delete(parent.id);
              }
              return next;
            });
          }}
        >
          {formatName(parent)}
        </Checkbox>
      ))}
      {!canSubmit && (
        <p className="text-sm text-destructive">{t("person.family.selectAtLeastOneParent")}</p>
      )}
    </LabeledField>
  );

  return (
    <FormDialog
      trigger={<AddButton label={t("person.family.addSibling")} />}
      title={t("person.family.addSibling")}
      onOpenChange={(next) => {
        if (!next) {
          setMode("search");
        }
      }}
    >
      {(close) => (
        <div className="space-y-3">
          <Select
            aria-label={t("person.family.parentage")}
            value={parentage}
            onValueChange={(value) => {
              if (value) setParentage(parentageSchema.parse(value));
            }}
            options={optionsFor(options, "parentage").map((option) => ({
              value: option.key,
              label: option.label,
            }))}
          />
          {parentPicker}
          {mode === "search" ? (
            <>
              <PersonPicker
                onSelect={(person) => {
                  if (canSubmit) void link(person, close);
                }}
                excludeIds={excludeIds}
              />
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setMode("create")}
              >
                {t("person.family.createNewPerson")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setMode("search")}>
                {t("person.family.searchInstead")}
              </Button>
              <AddSiblingCreateForm
                canSubmit={canSubmit}
                onSubmit={(value) => createAndLink(value, close)}
              />
            </>
          )}
        </div>
      )}
    </FormDialog>
  );
}

function AddSiblingCreateForm({
  canSubmit,
  onSubmit,
}: {
  canSubmit: boolean;
  onSubmit: (value: { given: string; surname: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: { given: "", surname: "" },
    onSubmit: async ({ value, formApi }) => {
      await onSubmit(value);
      formApi.reset();
    },
  });

  const { isDirty, isSubmitting } = useFormDirtyPending(form);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="given">
        {(field) => (
          <Input
            placeholder={t("person.firstNames")}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="surname">
        {(field) => (
          <Input
            placeholder={t("person.lastNames")}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting} disabled={!canSubmit}>
          {isSubmitting ? t("person.family.creating") : t("person.family.createAndLink")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
