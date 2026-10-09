import {
  genderSchema,
  isPresumedDeceased,
  joinHistoricalDateText,
  parseHistoricalDate,
  personRestrictionSchema,
  splitHistoricalDateText,
  type PersonRestriction,
} from "@genealogy/core";
import { Autocomplete } from "@genealogy/ui/components/autocomplete";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent, CardFooter } from "@genealogy/ui/components/card";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
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
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { ReadOnlyProvider } from "@genealogy/ui/lib/read-only";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage, type SupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { usePermissions } from "../../lib/permissions";
import { genderLabel } from "../../lib/person-display";
import { usePersonSettings } from "../../lib/person-settings";
import {
  listSuffixes,
  listTitlePrefixes,
  updatePerson,
} from "../../server/functions/person.functions";
import { AlternateNames } from "./-alternate-names";
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

/** A date field's three parts, as `HistoricalDateInput` edits them. */
type DateParts = ReturnType<typeof splitHistoricalDateText>;

/**
 * The stored date for what's in a date field — `null` when it's empty.
 * Bounds are recomputed from the current wording on every save, not carried
 * over from what was previously stored — otherwise editing the text alone
 * (without it happening to still parse to the same bounds) would leave a
 * stale earliest/latest attached to new words.
 */
function toHistoricalDate(parts: DateParts, language: SupportedLanguage) {
  const original = joinHistoricalDateText(parts, language);
  return original === null ? null : { original, ...parseHistoricalDate(original, language) };
}

/** An empty text field is stored as null, not "". */
function orNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

/**
 * The person's own fields — names and gender, birth, living status and
 * death — in one card. Opens as a read view (`DetailsReadView`); editors get
 * an Edit button that swaps in the form, and back after Save or Cancel. The
 * Settings page can make it open straight in the form instead
 * (`openInEditMode`); Viewers only ever get the read view.
 */
export function PersonDetailsCard({
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
  const { canEdit } = usePermissions();
  const settings = usePersonSettings();
  // null until the user chooses: follows the setting, which may load after
  // the first render.
  const [editing, setEditing] = useState<boolean | null>(null);
  const isEditing = canEdit && (editing ?? settings.openInEditMode);

  if (isEditing) {
    return (
      <PersonDetailsForm
        person={person}
        names={names}
        options={options}
        presumeDeceasedAfterYears={settings.presumeDeceasedAfterYears}
        onChanged={onChanged}
        // With the read view as the default, Save/Cancel go back to it.
        {...(settings.openInEditMode ? {} : { onDone: () => setEditing(false) })}
      />
    );
  }
  return (
    <DetailsReadView
      person={person}
      names={names}
      options={options}
      presumeDeceasedAfterYears={settings.presumeDeceasedAfterYears}
      onEdit={canEdit ? () => setEditing(true) : null}
      onChanged={onChanged}
    />
  );
}

/**
 * The form: one Save/Cancel and one `updatePerson` call for all the fields.
 * They used to be three cards with a Save each, which meant three buttons
 * for what users think of as one record, and unsaved changes in one card
 * easily forgotten while saving another. Alternate names live in here too
 * but save on their own (see `AlternateNames`). Mounted fresh each time
 * editing starts, so it always starts from the latest saved values.
 */
function PersonDetailsForm({
  person,
  names,
  options,
  presumeDeceasedAfterYears,
  onChanged,
  onDone,
}: {
  person: PersonRow;
  names: NameVariantRow[];
  options: ConfigurableOptionRow[];
  presumeDeceasedAfterYears: number;
  onChanged: () => Promise<void>;
  /** Back to the read view — after a save, or on Cancel. */
  onDone?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const updatePersonMutation = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });
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

  const birthSplit = splitHistoricalDateText(person.birth?.original ?? "", language);
  const deathSplit = splitHistoricalDateText(person.death?.original ?? "", language);
  const burialSplit = splitHistoricalDateText(person.burial?.original ?? "", language);

  const form = useForm({
    defaultValues: {
      gender: person.gender,
      given: person.given,
      surname: person.surname,
      titlePrefix: person.titlePrefix ?? "",
      suffix: person.suffix ?? "",
      birth: birthSplit,
      birthPlace: person.birthPlace ?? "",
      isLiving: person.isLiving,
      // "none" rather than null: a Select needs a key for "no restriction".
      restriction: (person.restriction ?? "none") as PersonRestriction | "none",
      death: deathSplit,
      deathPlace: person.deathPlace ?? "",
      causeOfDeath: person.causeOfDeath ?? "",
      burial: burialSplit,
      burialPlace: person.burialPlace ?? "",
    },
    onSubmit: async ({ value, formApi }) => {
      await updatePersonMutation.mutateAsync({
        data: {
          id: person.id,
          gender: value.gender,
          given: value.given,
          surname: value.surname,
          titlePrefix: orNull(value.titlePrefix),
          suffix: orNull(value.suffix),
          birth: toHistoricalDate(value.birth, language),
          birthPlace: orNull(value.birthPlace),
          isLiving: value.isLiving,
          restriction: value.restriction === "none" ? null : value.restriction,
          death: toHistoricalDate(value.death, language),
          deathPlace: orNull(value.deathPlace),
          causeOfDeath: orNull(value.causeOfDeath),
          burial: toHistoricalDate(value.burial, language),
          burialPlace: orNull(value.burialPlace),
        },
      });
      // Rebaselines dirty-tracking against what was just saved — the values
      // themselves don't change, only the "clean" snapshot they're compared to.
      formApi.reset(value);
      onDone?.();
    },
  });

  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const isLiving = useStore(form.store, (state) => state.values.isLiving);
  const birth = useStore(form.store, (state) => state.values.birth);
  const death = useStore(form.store, (state) => state.values.death);
  const burial = useStore(form.store, (state) => state.values.burial);

  /** A `HistoricalDateInput` bound to one of the form's date fields. */
  const dateInput = (name: "birth" | "death" | "burial", parts: DateParts, placeholder: string) => (
    <HistoricalDateInput
      placeholder={placeholder}
      quality={parts.quality}
      onQualityChange={(quality) => form.setFieldValue(name, { ...parts, quality })}
      value={parts.value}
      onChange={(value) => form.setFieldValue(name, { ...parts, value })}
      endValue={parts.endValue}
      onEndChange={(endValue) => form.setFieldValue(name, { ...parts, endValue })}
      preview={historicalDateFieldPreview(parts.quality, parts.value, parts.endValue, language)}
    />
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // TanStack Form rethrows onSubmit's rejection after resetting
        // isSubmitting — caught here only to avoid an unhandled rejection;
        // the failure itself is surfaced via updatePersonMutation.isError below.
        void form.handleSubmit().catch(() => {});
      }}
    >
      {/* No card title: each section's heading is styled as one instead
          (`DetailsSection`), so this reads as three titled parts of one card
          with one Save. Built from the Card parts directly because
          `SectionCard` always has a title. */}
      <Card>
        <CardContent className="space-y-8">
          <DetailsSection title={t("person.namesGender.title")}>
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
            <form.Field name="given">
              {(field) => <TextField field={field} label={t("person.firstNames")} />}
            </form.Field>
            <form.Field name="surname">
              {(field) => <TextField field={field} label={t("person.lastNames")} />}
            </form.Field>
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
            <div className="sm:col-span-2">
              <AlternateNames
                personId={person.id}
                names={names}
                options={options}
                onChanged={onChanged}
              />
            </div>
          </DetailsSection>

          <DetailsSection title={t("person.birth.title")}>
            <LabeledField label={t("person.birth.dateOfBirth")}>
              {dateInput("birth", birth, t("person.birth.datePlaceholder"))}
            </LabeledField>
            <form.Field name="birthPlace">
              {(field) => <TextField field={field} label={t("person.birth.placeOfBirth")} />}
            </form.Field>
          </DetailsSection>

          <DetailsSection title={t("person.livingStatusDeath.title")}>
            <div className="sm:col-span-2">
              <form.Field name="isLiving">
                {(field) => (
                  <ButtonRadioGroup
                    aria-label={t("person.livingStatusDeath.isLiving")}
                    value={field.state.value ? "living" : "deceased"}
                    onChange={(value) => field.handleChange(value === "living")}
                    options={[
                      { value: "living", label: t("person.livingStatusDeath.living") },
                      { value: "deceased", label: t("person.livingStatusDeath.deceased") },
                    ]}
                  />
                )}
              </form.Field>
            </div>
            {isPresumedDeceased(
              { isLiving, birth: toHistoricalDate(birth, language) },
              presumeDeceasedAfterYears,
            ) && (
              <PresumedDeceasedHint
                years={presumeDeceasedAfterYears}
                onMarkDeceased={() => form.setFieldValue("isLiving", false)}
              />
            )}
            {!isLiving && (
              <>
                {/* Only for the deceased: a living person is already shown to
                    Viewers by name only, so a restriction would add nothing. A
                    value stored while living is kept (and exported to GEDCOM),
                    just not shown. */}
                <form.Field name="restriction">
                  {(field) => (
                    <LabeledField label={t("person.restriction.label")} className="sm:col-span-2">
                      <Select
                        aria-label={t("person.restriction.label")}
                        value={field.state.value}
                        onChange={(value) => {
                          const parsed = personRestrictionSchema.safeParse(value);
                          field.handleChange(parsed.success ? parsed.data : "none");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem id="none">{t("person.restriction.none")}</SelectItem>
                          {personRestrictionSchema.options.map((restriction) => (
                            <SelectItem key={restriction} id={restriction}>
                              {t(`person.restriction.${restriction}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("person.restriction.description")}
                      </p>
                    </LabeledField>
                  )}
                </form.Field>
                <LabeledField label={t("person.livingStatusDeath.dateOfDeath")}>
                  {dateInput("death", death, t("person.livingStatusDeath.deathDatePlaceholder"))}
                </LabeledField>
                <form.Field name="deathPlace">
                  {(field) => (
                    <TextField field={field} label={t("person.livingStatusDeath.placeOfDeath")} />
                  )}
                </form.Field>
                <LabeledField label={t("person.livingStatusDeath.burialDate")}>
                  {dateInput("burial", burial, t("person.livingStatusDeath.burialDatePlaceholder"))}
                </LabeledField>
                <form.Field name="burialPlace">
                  {(field) => (
                    <TextField
                      field={field}
                      label={t("person.livingStatusDeath.burialPlace")}
                      placeholder={t("person.livingStatusDeath.burialPlacePlaceholder")}
                    />
                  )}
                </form.Field>
                <form.Field name="causeOfDeath">
                  {(field) => (
                    <TextField
                      field={field}
                      label={t("person.livingStatusDeath.causeOfDeath")}
                      placeholder={t("person.livingStatusDeath.causeOfDeathPlaceholder")}
                      className="sm:col-span-2"
                    />
                  )}
                </form.Field>
              </>
            )}
          </DetailsSection>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-2">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onPress={() => {
                form.reset();
                onDone?.();
              }}
            >
              {t("common.cancel")}
            </Button>
            <SaveButton isDirty={isDirty} isPending={isSubmitting}>
              {t("common.save")}
            </SaveButton>
          </div>
          {updatePersonMutation.isError && (
            <p className="text-sm text-destructive">{updatePersonMutation.error.message}</p>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}

/** The card when not editing: the same three sections as plain text. */
function DetailsReadView({
  person,
  names,
  options,
  presumeDeceasedAfterYears,
  onEdit,
  onChanged,
}: {
  person: PersonRow;
  names: NameVariantRow[];
  options: ConfigurableOptionRow[];
  presumeDeceasedAfterYears: number;
  /** Null for Viewers — no Edit button. */
  onEdit: (() => void) | null;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const markDeceased = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });
  const date = (value: PersonRow["birth"]) => formatDisplayDate(value, language);

  return (
    <Card>
      <CardContent className="space-y-8">
        <DetailsSection title={t("person.namesGender.title")}>
          <ReadField label={t("person.firstNames")} value={person.given} />
          <ReadField label={t("person.lastNames")} value={person.surname} />
          <ReadField label={t("common.gender.label")} value={genderLabel(person.gender, t)} />
          {person.titlePrefix && (
            <ReadField label={t("person.namesGender.titlePrefix")} value={person.titlePrefix} />
          )}
          {person.suffix && (
            <ReadField label={t("person.namesGender.suffix")} value={person.suffix} />
          )}
          {names.length > 0 && (
            <div className="sm:col-span-2">
              {/* The list only: its add/edit/remove follow ReadOnlyProvider. */}
              <ReadOnlyProvider readOnly>
                <AlternateNames
                  personId={person.id}
                  names={names}
                  options={options}
                  onChanged={onChanged}
                />
              </ReadOnlyProvider>
            </div>
          )}
        </DetailsSection>

        <DetailsSection title={t("person.birth.title")}>
          <ReadField label={t("person.birth.dateOfBirth")} value={date(person.birth)} />
          <ReadField label={t("person.birth.placeOfBirth")} value={person.birthPlace} />
        </DetailsSection>

        <DetailsSection title={t("person.livingStatusDeath.title")}>
          <ReadField
            label={t("person.detail.status")}
            value={
              person.isLiving
                ? t("person.livingStatusDeath.living")
                : t("person.livingStatusDeath.deceased")
            }
          />
          {onEdit && isPresumedDeceased(person, presumeDeceasedAfterYears) && (
            <PresumedDeceasedHint
              years={presumeDeceasedAfterYears}
              isPending={markDeceased.isPending}
              onMarkDeceased={() =>
                markDeceased.mutate({ data: { id: person.id, isLiving: false } })
              }
            />
          )}
          {!person.isLiving && (
            <>
              {person.restriction && (
                <ReadField
                  label={t("person.restriction.label")}
                  value={t(`person.restriction.${person.restriction}`)}
                />
              )}
              <ReadField
                label={t("person.livingStatusDeath.dateOfDeath")}
                value={date(person.death)}
              />
              <ReadField
                label={t("person.livingStatusDeath.placeOfDeath")}
                value={person.deathPlace}
              />
              {(person.burial || person.burialPlace) && (
                <>
                  <ReadField
                    label={t("person.livingStatusDeath.burialDate")}
                    value={date(person.burial)}
                  />
                  <ReadField
                    label={t("person.livingStatusDeath.burialPlace")}
                    value={person.burialPlace}
                  />
                </>
              )}
              {person.causeOfDeath && (
                <ReadField
                  label={t("person.livingStatusDeath.causeOfDeath")}
                  value={person.causeOfDeath}
                  className="sm:col-span-2"
                />
              )}
            </>
          )}
        </DetailsSection>
        {markDeceased.isError && (
          <p className="text-sm text-destructive">{markDeceased.error.message}</p>
        )}
      </CardContent>
      {onEdit && (
        <CardFooter className="justify-end">
          <Button variant="outline" onPress={onEdit}>
            <PencilIcon className="size-4" aria-hidden="true" />
            {t("common.edit")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** One label/value pair in the read view; an empty value shows as "—". */
function ReadField({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value && value.trim() !== "" ? value : "—"}</p>
    </div>
  );
}

/**
 * "Born more than N years ago — probably deceased", for someone still
 * marked living (`isPresumedDeceased`). The button marks them deceased: at
 * once in the read view, or in the form (then saved with the rest).
 */
function PresumedDeceasedHint({
  years,
  isPending = false,
  onMarkDeceased,
}: {
  years: number;
  isPending?: boolean;
  onMarkDeceased: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm sm:col-span-2">
      <span className="text-amber-800 dark:text-amber-300">
        {t("person.presumedDeceased.hint", { years })}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        isDisabled={isPending}
        onPress={onMarkDeceased}
      >
        {t("person.presumedDeceased.mark")}
      </Button>
    </div>
  );
}

/** A labelled text input for one of the form's string fields. */
function TextField({
  field,
  label,
  placeholder,
  className,
}: {
  field: {
    state: { value: string };
    handleBlur: () => void;
    handleChange: (value: string) => void;
  };
  label: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <LabeledField label={label} {...(className ? { className } : {})}>
      <Input
        {...(placeholder ? { placeholder } : {})}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </LabeledField>
  );
}

/**
 * One titled part of the card — the old cards' titles, styled exactly as a
 * card title (`CardTitle`'s classes) so the three read as they did, minus
 * the separate Saves.
 */
function DetailsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="leading-none font-semibold">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
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
