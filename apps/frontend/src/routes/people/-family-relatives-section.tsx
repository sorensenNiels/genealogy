import {
  formatLifespan,
  joinHistoricalDateText,
  parentageSchema,
  parseHistoricalDate,
  splitHistoricalDateText,
  unionStatusSchema,
  type Parentage,
  type UnionStatus,
} from "@genealogy/core";
import { AddButton } from "@genealogy/ui/components/add-button";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import {
  HistoricalDateInput,
  type HistoricalDateQuality,
} from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { Select } from "@genealogy/ui/components/select";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PencilIcon, UnlinkIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PersonPicker } from "../-person-picker";
import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { labelFor, optionsFor } from "../../lib/person-display";
import { usePersonName } from "../../lib/person-name";
import { usePersonPageDate } from "../../lib/person-settings";
import {
  addUnion,
  createPerson,
  getPersonById,
  linkParent,
  removeUnion,
  unlinkParent,
  unlinkSpouse,
  updateUnion,
} from "../../server/functions/person.functions";
import { historicalDateFieldPreview } from "./-shared";
import type { ConfigurableOptionRow, PersonRow, UnionRow } from "./-types";

type RelativeKind = "spouse" | "child";

const NO_UNIONS: UnionRow[] = [];

export function RelativesSection({
  title,
  kind,
  personId,
  relatives,
  excludeIds,
  options,
  onChanged,
  unions = NO_UNIONS,
}: {
  title: string;
  kind: RelativeKind;
  personId: string;
  relatives: PersonRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  /** Only meaningful for the Spouses section — shown alongside each spouse row. */
  unions?: UnionRow[];
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const unlinkParentMutation = useMutation({ mutationFn: unlinkParent });
  const unlinkSpouseMutation = useMutation({ mutationFn: unlinkSpouse });

  const remove = async (relativeId: string) => {
    if (kind === "spouse") {
      await unlinkSpouseMutation.mutateAsync({ data: { aId: personId, bId: relativeId } });
    } else {
      await unlinkParentMutation.mutateAsync({ data: { parentId: personId, childId: relativeId } });
    }
    await onChanged();
  };

  // unlinkSpouse deliberately leaves the union record behind (see its
  // comment in person.service.ts) — divorcing someone shouldn't erase the
  // marriage record. That means a union can point at someone no longer in
  // `relatives` at all: this page's own "Delete person" guard blocks on any
  // union regardless, so without surfacing these, a person can end up
  // impossible to delete with no visible reason why.
  const orphanedUnions =
    kind === "spouse"
      ? unions.filter(
          (union) => !relatives.some((r) => r.id === union.personAId || r.id === union.personBId),
        )
      : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <AddRelative
          kind={kind}
          personId={personId}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
        />
      </div>
      <div className="space-y-2">
        {relatives.map((relative) => {
          const union = unions.find(
            (candidate) =>
              (candidate.personAId === personId && candidate.personBId === relative.id) ||
              (candidate.personBId === personId && candidate.personAId === relative.id),
          );
          if (kind === "spouse") {
            return (
              <SpouseRow
                key={relative.id}
                relative={relative}
                union={union}
                options={options}
                onChanged={onChanged}
                onRemove={() => void remove(relative.id)}
              />
            );
          }
          return (
            <div key={relative.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <Link
                  to="/people/$personId"
                  params={{ personId: relative.id }}
                  className="hover:underline"
                >
                  {formatName(relative)}
                  {formatLifespan(relative) && (
                    <span className="ml-1 text-muted-foreground">({formatLifespan(relative)})</span>
                  )}
                </Link>
              </div>
              <RemoveButton
                itemLabel={t("person.family.relationshipWith", {
                  name: formatName(relative),
                })}
                onConfirm={() => void remove(relative.id)}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("person.family.removeChild")}
                  >
                    <UnlinkIcon className="size-4" />
                  </Button>
                }
              />
            </div>
          );
        })}
        {orphanedUnions.map((union) => (
          <OrphanedUnionRow
            key={union.id}
            personId={personId}
            union={union}
            options={options}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A union whose other side is no longer a linked spouse (see
 * `orphanedUnions` above) — still blocks deleting either person in it, so
 * this is the only place a user can find and remove one. `union` only has
 * the other person's id, not their name, so this fetches it directly rather
 * than widening `listUnions`'s response shape for a rarely-hit case.
 */
function OrphanedUnionRow({
  personId,
  union,
  options,
  onChanged,
}: {
  personId: string;
  union: UnionRow;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const formatDate = usePersonPageDate();
  const { formatName } = usePersonName();
  const otherId = union.personAId === personId ? union.personBId : union.personAId;
  const other = useQuery({
    queryKey: ["person", "byId", otherId],
    queryFn: () => getPersonById({ data: { id: otherId } }),
  });
  const removeUnionMutation = useMutation({ mutationFn: removeUnion });

  const remove = async () => {
    await removeUnionMutation.mutateAsync({ data: { id: union.id } });
    await onChanged();
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        {other.data ? (
          <Link to="/people/$personId" params={{ personId: otherId }} className="hover:underline">
            {formatName(other.data)}
          </Link>
        ) : (
          <span className="text-muted-foreground">{t("person.family.unknownPerson")}</span>
        )}
        <p className="text-xs text-muted-foreground">
          {labelFor(options, "union_status", union.status)} · {t("person.family.noLongerLinked")}
          {union.startDate ? ` · ${formatDate(union.startDate)}` : ""}
          {union.startPlace ? ` ${t("person.family.inPlace", { place: union.startPlace })}` : ""}
        </p>
      </div>
      <RemoveButton
        itemLabel={t("person.family.thisUnionRecord")}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/**
 * A linked spouse always has a union behind it — `AddRelative`'s `link()`
 * always creates one alongside the `SPOUSE_OF` edge — so `union` here is
 * only possibly missing if the two have drifted, not in normal use.
 */
function SpouseRow({
  relative,
  union,
  options,
  onChanged,
  onRemove,
}: {
  relative: PersonRow;
  union: UnionRow | undefined;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const formatDate = usePersonPageDate();
  const { formatName } = usePersonName();
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        <Link to="/people/$personId" params={{ personId: relative.id }} className="hover:underline">
          {formatName(relative)}
          {formatLifespan(relative) && (
            <span className="ml-1 text-muted-foreground">({formatLifespan(relative)})</span>
          )}
        </Link>
        {union && (
          <p className="text-xs text-muted-foreground">
            {labelFor(options, "union_status", union.status)}
            {union.startDate ? ` · ${formatDate(union.startDate)}` : ""}
          </p>
        )}
        {union?.notes && (
          <MarkdownContent className="text-xs text-muted-foreground">{union.notes}</MarkdownContent>
        )}
      </div>
      <div className="flex items-center gap-1">
        {union && (
          <FormDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("person.family.editUnion")}
              >
                <PencilIcon className="size-4" />
              </Button>
            }
            title={t("person.family.editUnion")}
          >
            {(close) => (
              <UnionForm
                union={union}
                options={options}
                onDone={async () => {
                  close();
                  await onChanged();
                }}
              />
            )}
          </FormDialog>
        )}
        <RemoveButton
          itemLabel={t("person.family.relationshipWith", { name: formatName(relative) })}
          onConfirm={onRemove}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("person.family.removeSpouse")}
            >
              <UnlinkIcon className="size-4" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** Edits an existing union's own facts — status, start date/place — the same fields `AddRelative` sets when creating one. */
function UnionForm({
  union,
  options,
  onDone,
}: {
  union: UnionRow;
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const updateUnionMutation = useMutation({ mutationFn: updateUnion });
  const [status, setStatus] = useState<UnionStatus>(unionStatusSchema.parse(union.status));

  const startSplit = splitHistoricalDateText(union.startDate?.original ?? "", language);

  const form = useForm({
    defaultValues: {
      startQuality: startSplit.quality,
      startValue: startSplit.value,
      startEndValue: startSplit.endValue,
      startPlace: union.startPlace ?? "",
      notes: union.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      const startDate = joinHistoricalDateText(
        {
          quality: value.startQuality,
          value: value.startValue,
          endValue: value.startEndValue,
        },
        language,
      );
      await updateUnionMutation.mutateAsync({
        data: {
          id: union.id,
          status,
          startDate:
            startDate === null
              ? null
              : { original: startDate, ...parseHistoricalDate(startDate, language) },
          startPlace: value.startPlace.trim() === "" ? null : value.startPlace,
          notes: value.notes.trim() === "" ? null : value.notes,
        },
      });
      await onDone();
    },
  });

  const { isDirty: formIsDirty, isSubmitting } = useFormDirtyPending(form);
  const startQuality = useStore(form.store, (state) => state.values.startQuality);
  const startValue = useStore(form.store, (state) => state.values.startValue);
  const startEndValue = useStore(form.store, (state) => state.values.startEndValue);
  // status is tracked outside the form (it drives a Select, not a
  // form.Field), so the form's own isDirty misses a status-only change.
  const isDirty = formIsDirty || status !== union.status;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Select
        aria-label={t("person.family.unionStatus")}
        value={status}
        onValueChange={(value) => {
          if (value) setStatus(unionStatusSchema.parse(value));
        }}
        options={optionsFor(options, "union_status").map((option) => ({
          value: option.key,
          label: option.label,
        }))}
      />
      <HistoricalDateInput
        placeholder={t("person.family.marriageDatePlaceholder")}
        quality={startQuality}
        onQualityChange={(quality) => form.setFieldValue("startQuality", quality)}
        value={startValue}
        onChange={(value) => form.setFieldValue("startValue", value)}
        endValue={startEndValue}
        onEndChange={(value) => form.setFieldValue("startEndValue", value)}
        preview={historicalDateFieldPreview(startQuality, startValue, startEndValue, language)}
      />
      <form.Field name="startPlace">
        {(field) => (
          <Input
            placeholder={t("person.family.marriagePlace")}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="notes">
        {(field) => (
          <MarkdownEditor
            aria-label={t("common.notes")}
            placeholder={t("common.notes")}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {t("common.save")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

function AddRelative({
  kind,
  personId,
  excludeIds,
  options: allOptions,
  onChanged,
}: {
  kind: RelativeKind;
  personId: string;
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [parentage, setParentage] = useState<Parentage>("unknown");
  const [unionStatus, setUnionStatus] = useState<UnionStatus>("married");
  const [unionQuality, setUnionQuality] = useState<HistoricalDateQuality>("exact");
  const [unionValue, setUnionValue] = useState("");
  const [unionEndValue, setUnionEndValue] = useState("");
  const [unionPlace, setUnionPlace] = useState("");
  const [unionNotes, setUnionNotes] = useState("");

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const addUnionMutation = useMutation({ mutationFn: addUnion });

  const unionOriginal = joinHistoricalDateText(
    {
      quality: unionQuality,
      value: unionValue,
      endValue: unionEndValue,
    },
    language,
  );

  const link = async (target: PersonRow, close: () => void) => {
    if (kind === "spouse") {
      await addUnionMutation.mutateAsync({
        data: {
          personAId: personId,
          personBId: target.id,
          status: unionStatus,
          startDate:
            unionOriginal === null
              ? null
              : { original: unionOriginal, ...parseHistoricalDate(unionOriginal, language) },
          startPlace: unionPlace.trim() === "" ? null : unionPlace,
          notes: unionNotes.trim() === "" ? null : unionNotes,
        },
      });
    } else {
      await linkParentMutation.mutateAsync({
        data: { parentId: personId, childId: target.id, parentage },
      });
    }
    close();
    await onChanged();
  };

  const kindLabel = kind === "spouse" ? t("person.family.addSpouse") : t("person.family.addChild");

  return (
    <FormDialog
      trigger={<AddButton label={kindLabel} />}
      title={kindLabel}
      onOpenChange={(next) => {
        if (!next) {
          setMode("search");
        }
      }}
    >
      {(close) => (
        <div className="space-y-3">
          {kind !== "spouse" && (
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
          )}
          {kind === "spouse" && (
            <div className="space-y-2">
              <Select
                aria-label={t("person.family.unionStatus")}
                value={unionStatus}
                onValueChange={(value) => {
                  if (value) setUnionStatus(unionStatusSchema.parse(value));
                }}
                options={optionsFor(allOptions, "union_status").map((option) => ({
                  value: option.key,
                  label: option.label,
                }))}
              />
              <HistoricalDateInput
                placeholder={t("person.family.datePlaceholder")}
                quality={unionQuality}
                onQualityChange={setUnionQuality}
                value={unionValue}
                onChange={setUnionValue}
                endValue={unionEndValue}
                onEndChange={setUnionEndValue}
                preview={historicalDateFieldPreview(
                  unionQuality,
                  unionValue,
                  unionEndValue,
                  language,
                )}
              />
              <Input
                placeholder={t("common.place")}
                value={unionPlace}
                onChange={(event) => setUnionPlace(event.target.value)}
              />
              <MarkdownEditor
                aria-label={t("common.notes")}
                placeholder={t("common.notes")}
                value={unionNotes}
                onChange={setUnionNotes}
              />
            </div>
          )}
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
              <CreateAndLinkForm
                kind={kind}
                personId={personId}
                parentage={parentage}
                unionStatus={unionStatus}
                unionOriginal={unionOriginal}
                unionPlace={unionPlace}
                unionNotes={unionNotes}
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

function CreateAndLinkForm({
  kind,
  personId,
  parentage,
  unionStatus,
  unionOriginal,
  unionPlace,
  unionNotes,
  onDone,
}: {
  kind: RelativeKind;
  personId: string;
  parentage: Parentage;
  unionStatus: UnionStatus;
  unionOriginal: string | null;
  unionPlace: string;
  unionNotes: string;
  onDone: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const createPersonMutation = useMutation({ mutationFn: createPerson });
  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const addUnionMutation = useMutation({ mutationFn: addUnion });

  const form = useForm({
    defaultValues: { given: "", surname: "" },
    onSubmit: async ({ value, formApi }) => {
      const created = await createPersonMutation.mutateAsync({ data: value });
      if (kind === "spouse") {
        await addUnionMutation.mutateAsync({
          data: {
            personAId: personId,
            personBId: created.id,
            status: unionStatus,
            startDate:
              unionOriginal === null
                ? null
                : { original: unionOriginal, ...parseHistoricalDate(unionOriginal, language) },
            startPlace: unionPlace.trim() === "" ? null : unionPlace,
            notes: unionNotes.trim() === "" ? null : unionNotes,
          },
        });
      } else {
        await linkParentMutation.mutateAsync({
          data: { parentId: personId, childId: created.id, parentage },
        });
      }
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
