import { formatLifespan, parentageSchema, type Parentage, type Gender } from "@genealogy/core";
import { AddButton } from "@genealogy/ui/components/add-button";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { Select } from "@genealogy/ui/components/select";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UnlinkIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PersonPicker } from "../-person-picker";
import { labelFor, optionsFor } from "../../lib/person-display";
import { usePersonName } from "../../lib/person-name";
import { createPerson, linkParent, unlinkParent } from "../../server/functions/person.functions";
import type { ConfigurableOptionRow, ParentRow, PersonRow } from "./-types";

/**
 * Parents get their own layout rather than reusing `RelativesSection`: a
 * birth father and mother are the common case and read better as named
 * slots than as an undifferentiated list, while adoptive/step/foster
 * parents — and any birth parent whose gender isn't recorded, or a third birth
 * parent a source disagrees about — fall through to a tagged "Other
 * parents" list instead of being forced into a slot that wouldn't be
 * accurate.
 */
export function ParentsSection({
  personId,
  parents,
  excludeIds,
  options,
  onChanged,
}: {
  personId: string;
  parents: ParentRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const unlinkParentMutation = useMutation({ mutationFn: unlinkParent });

  const remove = async (parentId: string) => {
    await unlinkParentMutation.mutateAsync({ data: { parentId, childId: personId } });
    await onChanged();
  };

  const father = parents.find((parent) => parent.parentage === "birth" && parent.gender === "M");
  const mother = parents.find((parent) => parent.parentage === "birth" && parent.gender === "F");
  const others = parents.filter((parent) => parent !== father && parent !== mother);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("person.family.parents")}</span>
        <AddOtherParent
          personId={personId}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
        />
      </div>
      <div className="space-y-3">
        <ParentSlot
          label={t("person.family.father")}
          personId={personId}
          parent={father}
          presetGender="M"
          excludeIds={excludeIds}
          onRemove={remove}
          onChanged={onChanged}
        />
        <ParentSlot
          label={t("person.family.mother")}
          personId={personId}
          parent={mother}
          presetGender="F"
          excludeIds={excludeIds}
          onRemove={remove}
          onChanged={onChanged}
        />
      </div>
      {others.length > 0 && (
        <div className="space-y-2">
          {others.map((parent) => (
            <div key={parent.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Link
                  to="/people/$personId"
                  params={{ personId: parent.id }}
                  className="hover:underline"
                >
                  {formatName(parent)}
                  {formatLifespan(parent) && (
                    <span className="ml-1 text-muted-foreground">({formatLifespan(parent)})</span>
                  )}
                </Link>
                <Badge variant="outline">{labelFor(options, "parentage", parent.parentage)}</Badge>
              </div>
              <RemoveButton
                itemLabel={t("person.family.relationshipWith", { name: formatName(parent) })}
                onConfirm={() => void remove(parent.id)}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("person.family.removeParentAria")}
                  >
                    <UnlinkIcon className="size-4" />
                  </Button>
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ParentSlot({
  label,
  personId,
  parent,
  presetGender,
  excludeIds,
  onRemove,
  onChanged,
}: {
  label: string;
  personId: string;
  parent: ParentRow | undefined;
  presetGender: Gender;
  excludeIds: Set<string>;
  onRemove: (parentId: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  if (!parent) {
    return (
      <AddParentSlot
        label={label}
        personId={personId}
        presetGender={presetGender}
        excludeIds={excludeIds}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <Link to="/people/$personId" params={{ personId: parent.id }} className="hover:underline">
          {formatName(parent)}
          {formatLifespan(parent) && (
            <span className="ml-1 text-muted-foreground">({formatLifespan(parent)})</span>
          )}
        </Link>
      </div>
      <RemoveButton
        itemLabel={t("person.family.relationshipWith", { name: formatName(parent) })}
        onConfirm={() => void onRemove(parent.id)}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("person.family.removeLabel", { label })}
          >
            <UnlinkIcon className="size-4" />
          </Button>
        }
      />
    </div>
  );
}

/** Fills the Father/Mother slot: parentage is always "birth", so there's nothing to pick. */
function AddParentSlot({
  label,
  personId,
  presetGender,
  excludeIds,
  onChanged,
}: {
  label: string;
  personId: string;
  presetGender: Gender;
  excludeIds: Set<string>;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"search" | "create">("search");

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const lowerLabel = label.toLowerCase();

  const link = async (target: PersonRow, close: () => void) => {
    await linkParentMutation.mutateAsync({
      data: { parentId: target.id, childId: personId, parentage: "birth" },
    });
    close();
    await onChanged();
  };

  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm" className="w-full justify-start">
          {t("person.family.addLabel", { label: lowerLabel })}
        </Button>
      }
      title={t("person.family.addLabelTitle", { label: lowerLabel })}
      onOpenChange={(next) => {
        if (!next) {
          setMode("search");
        }
      }}
    >
      {(close) => (
        <div className="space-y-3">
          {mode === "search" ? (
            <>
              <PersonPicker
                aria-label={t("person.family.searchForLabel", { label: lowerLabel })}
                onSelect={(person) => void link(person, close)}
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
              <CreateAndLinkParentForm
                personId={personId}
                parentage="birth"
                presetGender={presetGender}
                onDone={async () => {
                  close();
                  await onChanged();
                }}
              />
            </>
          )}
        </div>
      )}
    </FormDialog>
  );
}

/** Adoptive/step/foster parents, or any birth parent that doesn't fit a slot. */
function AddOtherParent({
  personId,
  excludeIds,
  options: allOptions,
  onChanged,
}: {
  personId: string;
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"search" | "create">("search");
  const [parentage, setParentage] = useState<Parentage>("unknown");

  const linkParentMutation = useMutation({ mutationFn: linkParent });

  const link = async (target: PersonRow, close: () => void) => {
    await linkParentMutation.mutateAsync({
      data: { parentId: target.id, childId: personId, parentage },
    });
    close();
    await onChanged();
  };

  return (
    <FormDialog
      trigger={<AddButton label={t("person.family.addOtherParent")} />}
      title={t("person.family.addOtherParent")}
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
            options={optionsFor(allOptions, "parentage").map((option) => ({
              value: option.key,
              label: option.label,
            }))}
          />
          {mode === "search" ? (
            <>
              <PersonPicker
                onSelect={(person) => void link(person, close)}
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
              <CreateAndLinkParentForm
                personId={personId}
                parentage={parentage}
                presetGender={null}
                onDone={async () => {
                  close();
                  await onChanged();
                }}
              />
            </>
          )}
        </div>
      )}
    </FormDialog>
  );
}

function CreateAndLinkParentForm({
  personId,
  parentage,
  presetGender,
  onDone,
}: {
  personId: string;
  parentage: Parentage;
  presetGender: Gender | null;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const createPersonMutation = useMutation({ mutationFn: createPerson });
  const linkParentMutation = useMutation({ mutationFn: linkParent });

  const form = useForm({
    defaultValues: { given: "", surname: "" },
    onSubmit: async ({ value, formApi }) => {
      const created = await createPersonMutation.mutateAsync({
        data: presetGender ? { ...value, gender: presetGender } : value,
      });
      await linkParentMutation.mutateAsync({
        data: { parentId: created.id, childId: personId, parentage },
      });
      formApi.reset();
      await onDone();
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
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {isSubmitting ? t("person.family.creating") : t("person.family.createAndLink")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
