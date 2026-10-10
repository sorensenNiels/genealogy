import {
  joinHistoricalDateText,
  nameVariantTypeSchema,
  parseHistoricalDate,
  splitHistoricalDateText,
  type NameVariantType,
} from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { Select } from "@genealogy/ui/components/select";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { labelFor, optionsFor } from "../../lib/person-display";
import { addName, removeName, updateName } from "../../server/functions/person.functions";
import { historicalDateFieldPreview } from "./-shared";
import type { ConfigurableOptionRow, NameVariantRow } from "./-types";

/**
 * A person's alternate names (married name, spelling variants, ...), inside
 * the Personal details card. Each add/edit/remove saves on its own, through
 * its own dialog — they're separate records, not fields of the person, so
 * they aren't part of that card's Save/Cancel.
 */
export function AlternateNames({
  personId,
  names,
  options,
  onChanged,
}: {
  personId: string;
  names: NameVariantRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const removeNameMutation = useMutation({ mutationFn: removeName });

  const removeNameById = async (id: string) => {
    await removeNameMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{t("person.namesGender.alternateNames")}</span>
        <FormDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("person.namesGender.addAlternateName")}
            >
              <PlusIcon className="size-4" />
            </Button>
          }
          title={t("person.namesGender.addAlternateName")}
        >
          {(close) => (
            <NameForm
              personId={personId}
              name={null}
              options={options}
              onDone={async () => {
                close();
                await onChanged();
              }}
            />
          )}
        </FormDialog>
      </div>
      {names.length > 0 && (
        <div className="space-y-2">
          {names.map((name) => (
            <NameRow
              key={name.id}
              personId={personId}
              name={name}
              options={options}
              onChanged={onChanged}
              onRemove={() => void removeNameById(name.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NameRow({
  personId,
  name,
  options,
  onChanged,
  onRemove,
}: {
  personId: string;
  name: NameVariantRow;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        <Badge variant="outline" className="mr-2">
          {labelFor(options, "name_variant_type", name.nameType)}
        </Badge>
        <span>{[name.given, name.surname].filter(Boolean).join(" ")}</span>
        {name.since && (
          <span className="ml-1 text-muted-foreground">
            {t("person.namesGender.since", { date: formatDisplayDate(name.since, language) })}
          </span>
        )}
        {name.notes && (
          <MarkdownContent className="text-xs text-muted-foreground">{name.notes}</MarkdownContent>
        )}
      </div>
      <div className="flex items-center gap-1">
        <FormDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("person.namesGender.editAlternateName")}
            >
              <PencilIcon className="size-4" />
            </Button>
          }
          title={t("person.namesGender.editAlternateName")}
        >
          {(close) => (
            <NameForm
              personId={personId}
              name={name}
              options={options}
              onDone={async () => {
                close();
                await onChanged();
              }}
            />
          )}
        </FormDialog>
        <RemoveButton
          itemLabel={t("person.namesGender.alternateNameLabel", {
            name: [name.given, name.surname].filter(Boolean).join(" "),
          })}
          onConfirm={onRemove}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("person.namesGender.removeAlternateName")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

function NameForm({
  personId,
  name,
  options,
  onDone,
}: {
  personId: string;
  name: NameVariantRow | null;
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const addNameMutation = useMutation({ mutationFn: addName });
  const updateNameMutation = useMutation({ mutationFn: updateName });
  const initialNameType: NameVariantType = name?.nameType ?? "birth";
  const [nameType, setNameType] = useState(initialNameType);

  const sinceSplit = splitHistoricalDateText(name?.since?.original ?? "", language);

  const form = useForm({
    defaultValues: {
      given: name?.given ?? "",
      surname: name?.surname ?? "",
      sinceQuality: sinceSplit.quality,
      sinceValue: sinceSplit.value,
      sinceEndValue: sinceSplit.endValue,
      notes: name?.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      const sinceOriginal = joinHistoricalDateText(
        {
          quality: value.sinceQuality,
          value: value.sinceValue,
          endValue: value.sinceEndValue,
        },
        language,
      );
      const payload = {
        nameType,
        given: value.given,
        surname: value.surname,
        since:
          sinceOriginal === null
            ? null
            : { original: sinceOriginal, ...parseHistoricalDate(sinceOriginal, language) },
        notes: value.notes.trim() === "" ? null : value.notes,
      };
      if (name) {
        await updateNameMutation.mutateAsync({ data: { id: name.id, ...payload } });
      } else {
        await addNameMutation.mutateAsync({ data: { personId, ...payload } });
      }
      await onDone();
    },
  });

  const { isDirty: formIsDirty, isSubmitting } = useFormDirtyPending(form);
  const sinceQuality = useStore(form.store, (state) => state.values.sinceQuality);
  const sinceValue = useStore(form.store, (state) => state.values.sinceValue);
  const sinceEndValue = useStore(form.store, (state) => state.values.sinceEndValue);
  // nameType is tracked outside the form (it drives a Select, not a form.Field),
  // so the form's own isDirty misses a type-only change — combine both.
  const isDirty = formIsDirty || nameType !== initialNameType;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Select
        aria-label={t("person.namesGender.nameType")}
        value={nameType}
        onValueChange={(value) => {
          if (value) setNameType(nameVariantTypeSchema.parse(value));
        }}
        options={optionsFor(options, "name_variant_type").map((option) => ({
          value: option.key,
          label: option.label,
        }))}
      />
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
      <HistoricalDateInput
        placeholder={t("person.namesGender.sincePlaceholder")}
        quality={sinceQuality}
        onQualityChange={(quality) => form.setFieldValue("sinceQuality", quality)}
        value={sinceValue}
        onChange={(value) => form.setFieldValue("sinceValue", value)}
        endValue={sinceEndValue}
        onEndChange={(value) => form.setFieldValue("sinceEndValue", value)}
        preview={historicalDateFieldPreview(sinceQuality, sinceValue, sinceEndValue, language)}
      />
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
          {name ? t("common.save") : t("common.add")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
