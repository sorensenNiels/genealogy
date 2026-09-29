import {
  joinHistoricalDateText,
  nameVariantTypeSchema,
  parseHistoricalDate,
  genderSchema,
  splitHistoricalDateText,
  type NameVariantType,
} from "@genealogy/core";
import { Autocomplete } from "@genealogy/ui/components/autocomplete";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { genderLabel, labelFor, optionsFor } from "../../lib/person-display";
import {
  addName,
  listSuffixes,
  listTitlePrefixes,
  removeName,
  updateName,
  updatePerson,
} from "../../server/functions/person.functions";
import { historicalDateFieldPreview } from "./-shared";
import type { ConfigurableOptionRow, NameVariantRow, PersonRow } from "./-types";

// A starting point, not a closed vocabulary — the Title/prefix and Suffix
// fields below merge these with whatever's already been typed for other
// people (see the listTitlePrefixes/listSuffixes queries), so the
// autocomplete favors values already in use once there are any. Swapped by
// current UI language, not by anything about the record itself — a title as
// actually recorded should still be typed in whatever language the source
// used, this only changes which suggestions are offered.
const STANDARD_TITLE_PREFIXES_EN = [
  "Mr.",
  "Mrs.",
  "Miss",
  "Ms.",
  "Dr.",
  "Rev.",
  "Fr.",
  "Prof.",
  "Sir",
  "Lady",
  "Lord",
  "Capt.",
  "Col.",
  "Maj.",
  "Gen.",
  "Lt.",
  "Sgt.",
  "Hon.",
];
const STANDARD_TITLE_PREFIXES_DA = [
  "Hr.",
  "Fru",
  "Frk.",
  "Dr.",
  "Pastor",
  "Prof.",
  "Kaptajn",
  "Oberst",
  "Major",
  "General",
  "Løjtnant",
  "Sergent",
];
const STANDARD_SUFFIXES_EN = [
  "Jr.",
  "Sr.",
  "II",
  "III",
  "IV",
  "V",
  "Esq.",
  "PhD",
  "MD",
  "DDS",
  "DVM",
  "RN",
];
const STANDARD_SUFFIXES_DA = ["Jr.", "Sr.", "II", "III", "IV", "V"];

/**
 * Names, gender, and alternate names — its own form/mutation/Save/Cancel,
 * independent of Birth and Living status & death, so the three cards can be
 * edited (and, later, rearranged) without one's unsaved changes touching
 * another's.
 */
export function NamesGenderCard({
  person,
  names,
  options,
  onChanged,
}: {
  person: PersonRow;
  names: NameVariantRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const updatePersonMutation = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });
  const removeNameMutation = useMutation({ mutationFn: removeName });
  const titlePrefixesQuery = useQuery({
    queryKey: ["person", "listTitlePrefixes"],
    queryFn: () => listTitlePrefixes(),
  });
  const suffixesQuery = useQuery({
    queryKey: ["person", "listSuffixes"],
    queryFn: () => listSuffixes(),
  });
  const titlePrefixOptions = mergeOptions(
    language === "da" ? STANDARD_TITLE_PREFIXES_DA : STANDARD_TITLE_PREFIXES_EN,
    titlePrefixesQuery.data,
  );
  const suffixOptions = mergeOptions(
    language === "da" ? STANDARD_SUFFIXES_DA : STANDARD_SUFFIXES_EN,
    suffixesQuery.data,
  );

  const removeNameById = async (id: string) => {
    await removeNameMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  const form = useForm({
    defaultValues: {
      given: person.given,
      surname: person.surname,
      gender: person.gender,
      titlePrefix: person.titlePrefix ?? "",
      suffix: person.suffix ?? "",
    },
    onSubmit: async ({ value, formApi }) => {
      await updatePersonMutation.mutateAsync({
        data: {
          id: person.id,
          given: value.given,
          surname: value.surname,
          gender: value.gender,
          titlePrefix: value.titlePrefix.trim() === "" ? null : value.titlePrefix,
          suffix: value.suffix.trim() === "" ? null : value.suffix,
        },
      });
      // Rebaselines dirty-tracking against what was just saved — the values
      // themselves don't change, only the "clean" snapshot they're compared to.
      formApi.reset(value);
    },
  });

  const { isDirty, isSubmitting } = useFormDirtyPending(form);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // TanStack Form rethrows onSubmit's rejection after resetting
        // isSubmitting — caught here only to avoid an unhandled rejection;
        // the failure itself is surfaced via update.isError below.
        void form.handleSubmit().catch(() => {});
      }}
    >
      <SectionCard
        title={t("person.namesGender.title")}
        contentClassName="grid gap-4 sm:grid-cols-2"
        footerClassName="flex-col items-stretch gap-2"
        footer={
          <>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onPress={() => form.reset()}>
                {t("common.cancel")}
              </Button>
              <SaveButton isDirty={isDirty} isPending={isSubmitting}>
                {t("common.save")}
              </SaveButton>
            </div>
            {updatePersonMutation.isError && (
              <p className="text-sm text-destructive">{updatePersonMutation.error.message}</p>
            )}
          </>
        }
      >
        <div className="sm:col-span-2">
          <form.Field name="gender">
            {(field) => (
              <ButtonRadioGroup
                aria-label={t("common.gender.label")}
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
                options={genderSchema.options.map((option) => ({
                  value: option,
                  label: genderLabel(option, t),
                }))}
              />
            )}
          </form.Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
          <form.Field name="given">
            {(field) => (
              <LabeledField label={t("person.firstNames")}>
                <Input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </LabeledField>
            )}
          </form.Field>
          <form.Field name="surname">
            {(field) => (
              <LabeledField label={t("person.lastNames")}>
                <Input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </LabeledField>
            )}
          </form.Field>
        </div>
        <div className="space-y-2 text-sm sm:col-span-2">
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
                  personId={person.id}
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
                  personId={person.id}
                  name={name}
                  options={options}
                  onChanged={onChanged}
                  onRemove={() => void removeNameById(name.id)}
                />
              ))}
            </div>
          )}
        </div>
        <form.Field name="titlePrefix">
          {(field) => (
            <LabeledField label={t("person.namesGender.titlePrefix")}>
              <Autocomplete
                aria-label={t("person.namesGender.titlePrefix")}
                placeholder={t("person.namesGender.titlePrefixPlaceholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={field.handleChange}
                options={titlePrefixOptions}
                isClearable
              />
            </LabeledField>
          )}
        </form.Field>
        <form.Field name="suffix">
          {(field) => (
            <LabeledField label={t("person.namesGender.suffix")}>
              <Autocomplete
                aria-label={t("person.namesGender.suffix")}
                placeholder={t("person.namesGender.suffixPlaceholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={field.handleChange}
                options={suffixOptions}
                isClearable
              />
            </LabeledField>
          )}
        </form.Field>
      </SectionCard>
    </form>
  );
}

/**
 * Standard values first (recognizable, always offered), then whatever's
 * already recorded for other people that isn't already in that list —
 * de-duplicated and alphabetized, so a value someone already used shows up
 * without drowning out the common ones.
 */
function mergeOptions(
  standard: readonly string[],
  recorded: readonly string[] | undefined,
): string[] {
  const extra = (recorded ?? [])
    .filter((value) => !standard.includes(value))
    .toSorted((a, b) => a.localeCompare(b));
  return [...standard, ...extra];
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
        onChange={(value) => {
          if (value) setNameType(nameVariantTypeSchema.parse(value));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionsFor(options, "name_variant_type").map((option) => (
            <SelectItem key={option.key} id={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
