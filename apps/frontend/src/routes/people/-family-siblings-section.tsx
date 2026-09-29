import { formatLifespan, formatPersonName, parentageSchema, type Parentage } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { Tooltip, TooltipContent } from "@genealogy/ui/components/tooltip";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { optionsFor } from "../../lib/person-display";
import { createPerson, linkParent, listPersons } from "../../server/functions/person.functions";
import type { ConfigurableOptionRow, ParentRow, PersonRow } from "./-types";

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
  siblings: PersonRow[];
  parents: ParentRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
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
              {formatPersonName(sibling)}
              {formatLifespan(sibling) && (
                <span className="ml-1 text-muted-foreground">({formatLifespan(sibling)})</span>
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
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [parentage, setParentage] = useState<Parentage>("unknown");
  const [selectedParentIds, setSelectedParentIds] = useState<Set<string>>(
    () => new Set(parents.map((parent) => parent.id)),
  );

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open && mode === "search",
  });
  const searchOptions = (search.data?.items ?? []).filter(
    (candidate) => !excludeIds.has(candidate.id),
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
          isSelected={selectedParentIds.has(parent.id)}
          onChange={(checked) => {
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
          {formatPersonName(parent)}
        </Checkbox>
      ))}
      {!canSubmit && (
        <p className="text-sm text-destructive">{t("person.family.selectAtLeastOneParent")}</p>
      )}
    </LabeledField>
  );

  return (
    <FormDialog
      trigger={
        <Tooltip>
          <Button variant="outline" size="icon" aria-label={t("person.family.addSibling")}>
            <PlusIcon className="size-4" />
          </Button>
          <TooltipContent>{t("person.family.addSibling")}</TooltipContent>
        </Tooltip>
      }
      title={t("person.family.addSibling")}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setMode("search");
          setQuery("");
        }
      }}
    >
      {(close) => (
        <div className="space-y-3">
          <Select
            aria-label={t("person.family.parentage")}
            value={parentage}
            onChange={(value) => {
              if (value) setParentage(parentageSchema.parse(value));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsFor(options, "parentage").map((option) => (
                <SelectItem key={option.key} id={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {parentPicker}
          {mode === "search" ? (
            <>
              <Combobox<PersonRow>
                aria-label={t("person.family.searchPeople")}
                items={searchOptions}
                inputValue={query}
                onInputChange={setQuery}
                onChange={(value) => {
                  const target = searchOptions.find((candidate) => candidate.id === value);
                  if (target && canSubmit) void link(target, close);
                }}
              >
                <ComboboxInput placeholder={t("person.family.searchPeople")} />
                <ComboboxContent<PersonRow>
                  renderEmptyState={() => (
                    <ComboboxEmpty>{t("person.family.noMatches")}</ComboboxEmpty>
                  )}
                >
                  {(item) => (
                    <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
                      {formatPersonName(item)}
                      {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
                    </ComboboxItem>
                  )}
                </ComboboxContent>
              </Combobox>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onPress={() => setMode("create")}
              >
                {t("person.family.createNewPerson")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onPress={() => setMode("search")}>
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
        <SaveButton isDirty={isDirty} isPending={isSubmitting} isDisabled={!canSubmit}>
          {isSubmitting ? t("person.family.creating") : t("person.family.createAndLink")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
