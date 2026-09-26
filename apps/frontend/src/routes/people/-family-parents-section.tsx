import {
  formatLifespan,
  formatPersonName,
  parentageSchema,
  type Parentage,
  type Gender,
} from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
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
import { RemoveButton } from "@genealogy/ui/components/remove-button";
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
import { PlusIcon, UnlinkIcon } from "lucide-react";
import { useState } from "react";

import { GenderIcon, labelFor, optionsFor } from "../../lib/person-display";
import {
  createPerson,
  linkParent,
  listPersons,
  unlinkParent,
} from "../../server/functions/person.functions";
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
        <span className="text-sm font-medium">Parents</span>
        <AddOtherParent
          personId={personId}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
        />
      </div>
      <div className="space-y-3">
        <ParentSlot
          label="Father"
          personId={personId}
          parent={father}
          presetGender="M"
          excludeIds={excludeIds}
          onRemove={remove}
          onChanged={onChanged}
        />
        <ParentSlot
          label="Mother"
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
                  {formatPersonName(parent)}
                  {formatLifespan(parent) && (
                    <span className="ml-1 text-muted-foreground">({formatLifespan(parent)})</span>
                  )}
                </Link>
                <Badge variant="outline">{labelFor(options, "parentage", parent.parentage)}</Badge>
              </div>
              <RemoveButton
                itemLabel={`the relationship with ${formatPersonName(parent)}`}
                onConfirm={() => void remove(parent.id)}
                trigger={
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove parent">
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
          {formatPersonName(parent)}
          {formatLifespan(parent) && (
            <span className="ml-1 text-muted-foreground">({formatLifespan(parent)})</span>
          )}
        </Link>
      </div>
      <RemoveButton
        itemLabel={`the relationship with ${formatPersonName(parent)}`}
        onConfirm={() => void onRemove(parent.id)}
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label}`}>
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
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open && mode === "search",
  });

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const options = (search.data?.items ?? []).filter((candidate) => !excludeIds.has(candidate.id));

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
          + Add {label.toLowerCase()}
        </Button>
      }
      title={`Add ${label.toLowerCase()}`}
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
          {mode === "search" ? (
            <>
              <Combobox<PersonRow>
                aria-label={`Search for ${label.toLowerCase()}`}
                items={options}
                inputValue={query}
                onInputChange={setQuery}
                onChange={(value) => {
                  const target = options.find((candidate) => candidate.id === value);
                  if (target) void link(target, close);
                }}
              >
                <ComboboxInput placeholder="Search people…" />
                <ComboboxContent<PersonRow>
                  renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
                >
                  {(item) => (
                    <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
                      <span className="flex items-center gap-1.5">
                        <GenderIcon gender={item.gender} className="size-3.5" />
                        {formatPersonName(item)}
                        {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
                      </span>
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
                + Create new person
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onPress={() => setMode("search")}>
                ← Search instead
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
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [parentage, setParentage] = useState<Parentage>("unknown");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open && mode === "search",
  });

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const options = (search.data?.items ?? []).filter((candidate) => !excludeIds.has(candidate.id));

  const link = async (target: PersonRow, close: () => void) => {
    await linkParentMutation.mutateAsync({
      data: { parentId: target.id, childId: personId, parentage },
    });
    close();
    await onChanged();
  };

  return (
    <FormDialog
      trigger={
        <Tooltip>
          <Button variant="outline" size="icon" aria-label="Add other parent">
            <PlusIcon className="size-4" />
          </Button>
          <TooltipContent>Add other parent</TooltipContent>
        </Tooltip>
      }
      title="Add other parent"
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
            aria-label="Parentage"
            value={parentage}
            onChange={(value) => {
              if (value) setParentage(parentageSchema.parse(value));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsFor(allOptions, "parentage").map((option) => (
                <SelectItem key={option.key} id={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode === "search" ? (
            <>
              <Combobox<PersonRow>
                aria-label="Search people"
                items={options}
                inputValue={query}
                onInputChange={setQuery}
                onChange={(value) => {
                  const target = options.find((candidate) => candidate.id === value);
                  if (target) void link(target, close);
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
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onPress={() => setMode("create")}
              >
                + Create new person
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onPress={() => setMode("search")}>
                ← Search instead
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
            placeholder="First names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="surname">
        {(field) => (
          <Input
            placeholder="Last names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create and link"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
