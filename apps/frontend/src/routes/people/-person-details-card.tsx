import {
  formatPersonName,
  genderSchema,
  isPresumedDeceased,
  joinHistoricalDateText,
  parseHistoricalDate,
  splitHistoricalDateText,
} from "@genealogy/core";
import { Autocomplete } from "@genealogy/ui/components/autocomplete";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent, CardFooter } from "@genealogy/ui/components/card";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { cn } from "@genealogy/ui/lib/utils";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Baby, Flower2, HeartHandshake, PencilIcon, PlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage, type SupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { lifeAtAGlance, type LifeMilestone } from "../../lib/life-summary";
import { usePermissions } from "../../lib/permissions";
import { genderLabel, labelFor } from "../../lib/person-display";
import { usePersonSettings } from "../../lib/person-settings";
import {
  listSuffixes,
  listTitlePrefixes,
  updatePerson,
} from "../../server/functions/person.functions";
import { AlternateNames } from "./-alternate-names";
import { historicalDateFieldPreview } from "./-shared";
import type { ConfigurableOptionRow, NameVariantRow, PersonRow, UnionRow } from "./-types";

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
  unions,
  spouses,
  childCount,
  options,
  onChanged,
}: {
  person: PersonRow;
  names: NameVariantRow[];
  /** For the read view's milestones and summary. */
  unions: UnionRow[];
  spouses: PersonRow[];
  childCount: number;
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
      unions={unions}
      spouses={spouses}
      childCount={childCount}
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

/**
 * The card when not editing — "life at a glance": a short generated
 * summary (`lifeAtAGlance`), then birth, unions and death as milestones on
 * a line, the person's other names, and for editors one-click prompts for
 * the facts still missing (each opens the form). Names, gender and the
 * badges are in the header above, so they aren't repeated here.
 */
function DetailsReadView({
  person,
  names,
  unions,
  spouses,
  childCount,
  options,
  presumeDeceasedAfterYears,
  onEdit,
  onChanged,
}: {
  person: PersonRow;
  names: NameVariantRow[];
  unions: UnionRow[];
  spouses: PersonRow[];
  childCount: number;
  options: ConfigurableOptionRow[];
  presumeDeceasedAfterYears: number;
  /** Null for Viewers — no Edit button or prompts. */
  onEdit: (() => void) | null;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const markDeceased = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });

  const { milestones, sentences } = lifeAtAGlance({
    person,
    unions: unions
      .filter((union) => union.personAId === person.id || union.personBId === person.id)
      .map((union) => {
        const partnerId = union.personAId === person.id ? union.personBId : union.personAId;
        const partner = spouses.find((spouse) => spouse.id === partnerId);
        return {
          startDate: union.startDate,
          startPlace: union.startPlace,
          status: union.status,
          partnerId: partner ? partnerId : null,
          partnerName: partner ? formatPersonName(partner) : t("person.events.unknownSpouse"),
        };
      }),
    childCount,
    formatDate: (date) => formatDisplayDate(date, language),
  });

  // What an editor could still fill in — each prompt opens the form.
  const missing = [
    ...(person.birth ? [] : [t("person.lifeSummary.missing.birthDate")]),
    ...(person.birthPlace ? [] : [t("person.lifeSummary.missing.birthPlace")]),
    ...(person.isLiving || person.death ? [] : [t("person.lifeSummary.missing.deathDate")]),
    ...(person.isLiving || person.deathPlace ? [] : [t("person.lifeSummary.missing.deathPlace")]),
  ];

  return (
    <Card>
      <CardContent className="space-y-6">
        {sentences.length > 0 ? (
          <p className="text-base leading-relaxed">
            {sentences
              .map((sentence) => t(`person.lifeSummary.${sentence.key}`, sentence.params))
              .join(" ")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("person.lifeSummary.empty")}</p>
        )}

        {onEdit && isPresumedDeceased(person, presumeDeceasedAfterYears) && (
          <PresumedDeceasedHint
            years={presumeDeceasedAfterYears}
            isPending={markDeceased.isPending}
            onMarkDeceased={() => markDeceased.mutate({ data: { id: person.id, isLiving: false } })}
          />
        )}
        {markDeceased.isError && (
          <p className="text-sm text-destructive">{markDeceased.error.message}</p>
        )}

        {milestones.length > 0 && (
          <Milestones milestones={milestones} person={person} options={options} />
        )}

        {names.length > 0 && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t("person.lifeSummary.alsoKnownAs")}</span>{" "}
            {names.map((name, index) => (
              <span key={name.id}>
                {index > 0 && ", "}
                <span className="font-medium">
                  {[name.given, name.surname].filter(Boolean).join(" ")}
                </span>{" "}
                <span className="text-muted-foreground">
                  ({labelFor(options, "name_variant_type", name.nameType)})
                </span>
              </span>
            ))}
          </p>
        )}

        {onEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {missing.map((label) => (
              <Button key={label} variant="ghost" size="sm" onPress={onEdit}>
                <PlusIcon className="size-3.5" aria-hidden="true" />
                {label}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="ml-auto" onPress={onEdit}>
              <PencilIcon className="size-4" aria-hidden="true" />
              {t("common.edit")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MILESTONE_LOOK = {
  birth: { Icon: Baby, tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  union: { Icon: HeartHandshake, tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  death: { Icon: Flower2, tone: "bg-muted text-muted-foreground" },
} as const;

/**
 * Birth, unions and death on a line: an icon per milestone, its date (big),
 * place, partner and the age at the time. Across the card on wider
 * screens, stacked on a phone. Burial and cause of death sit under the
 * death, where they belong.
 */
function Milestones({
  milestones,
  person,
  options,
}: {
  milestones: LifeMilestone[];
  person: PersonRow;
  options: ConfigurableOptionRow[];
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  // The connecting line runs between the first and last icon centres.
  const inset = `${50 / milestones.length}%`;

  const title = (milestone: LifeMilestone) => {
    if (milestone.kind === "birth") return t("person.lifeSummary.milestone.born");
    if (milestone.kind === "death") return t("person.lifeSummary.milestone.died");
    return milestone.unionStatus === "married"
      ? t("person.lifeSummary.milestone.married")
      : labelFor(options, "union_status", milestone.unionStatus ?? "");
  };

  return (
    <ol className="relative grid gap-5 sm:auto-cols-fr sm:grid-flow-col sm:gap-4">
      {milestones.length > 1 && (
        <li
          aria-hidden="true"
          className="absolute top-5 hidden h-px bg-border sm:block"
          style={{ left: inset, right: inset }}
        />
      )}
      {milestones.map((milestone, index) => {
        const { Icon, tone } = MILESTONE_LOOK[milestone.kind];
        return (
          <li
            // A milestone's kind and position are its identity here.
            // eslint-disable-next-line react/no-array-index-key
            key={`${milestone.kind}-${index}`}
            className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center"
          >
            <span
              className={cn(
                "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                tone,
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {title(milestone)}
              </p>
              <p className="font-semibold">{formatDisplayDate(milestone.date, language) ?? "—"}</p>
              {milestone.place && (
                <p className="text-sm text-muted-foreground">{milestone.place}</p>
              )}
              {milestone.partner &&
                (milestone.partner.id ? (
                  <Link
                    to="/people/$personId"
                    params={{ personId: milestone.partner.id }}
                    className="text-sm hover:underline"
                  >
                    {milestone.partner.name}
                  </Link>
                ) : (
                  <p className="text-sm">{milestone.partner.name}</p>
                ))}
              {milestone.kind === "death" && (person.burial || person.burialPlace) && (
                <p className="text-xs text-muted-foreground">
                  {t("person.lifeSummary.buried", {
                    what: [formatDisplayDate(person.burial, language), person.burialPlace]
                      .filter(Boolean)
                      .join(", "),
                  })}
                </p>
              )}
              {milestone.kind === "death" && person.causeOfDeath && (
                <p className="text-xs text-muted-foreground">
                  {t("person.lifeSummary.cause", { cause: person.causeOfDeath })}
                </p>
              )}
              {milestone.age !== null && (
                <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs">
                  {t("person.lifeSummary.aged", { age: milestone.age })}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
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
