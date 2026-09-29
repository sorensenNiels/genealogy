import {
  joinHistoricalDateText,
  parseHistoricalDate,
  splitHistoricalDateText,
} from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { updatePerson } from "../../server/functions/person.functions";
import { historicalDateFieldPreview } from "./-shared";
import type { PersonRow } from "./-types";

/** Living status, death and burial — its own form/mutation/Save/Cancel; see the comment on `NamesGenderCard`. */
export function LivingStatusDeathCard({
  person,
  onChanged,
}: {
  person: PersonRow;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const updatePersonMutation = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });
  const deathSplit = splitHistoricalDateText(person.death?.original ?? "", language);
  const burialSplit = splitHistoricalDateText(person.burial?.original ?? "", language);

  const form = useForm({
    defaultValues: {
      isLiving: person.isLiving,
      deathQuality: deathSplit.quality,
      deathValue: deathSplit.value,
      deathEndValue: deathSplit.endValue,
      deathPlace: person.deathPlace ?? "",
      causeOfDeath: person.causeOfDeath ?? "",
      burialQuality: burialSplit.quality,
      burialValue: burialSplit.value,
      burialEndValue: burialSplit.endValue,
      burialPlace: person.burialPlace ?? "",
    },
    onSubmit: async ({ value, formApi }) => {
      const deathOriginal = joinHistoricalDateText(
        {
          quality: value.deathQuality,
          value: value.deathValue,
          endValue: value.deathEndValue,
        },
        language,
      );
      const burialOriginal = joinHistoricalDateText(
        {
          quality: value.burialQuality,
          value: value.burialValue,
          endValue: value.burialEndValue,
        },
        language,
      );
      await updatePersonMutation.mutateAsync({
        data: {
          id: person.id,
          isLiving: value.isLiving,
          death:
            deathOriginal === null
              ? null
              : { original: deathOriginal, ...parseHistoricalDate(deathOriginal, language) },
          deathPlace: value.deathPlace.trim() === "" ? null : value.deathPlace,
          causeOfDeath: value.causeOfDeath.trim() === "" ? null : value.causeOfDeath,
          burial:
            burialOriginal === null
              ? null
              : { original: burialOriginal, ...parseHistoricalDate(burialOriginal, language) },
          burialPlace: value.burialPlace.trim() === "" ? null : value.burialPlace,
        },
      });
      formApi.reset(value);
    },
  });

  const isLiving = useStore(form.store, (state) => state.values.isLiving);
  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const deathQuality = useStore(form.store, (state) => state.values.deathQuality);
  const deathValue = useStore(form.store, (state) => state.values.deathValue);
  const deathEndValue = useStore(form.store, (state) => state.values.deathEndValue);
  const burialQuality = useStore(form.store, (state) => state.values.burialQuality);
  const burialValue = useStore(form.store, (state) => state.values.burialValue);
  const burialEndValue = useStore(form.store, (state) => state.values.burialEndValue);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit().catch(() => {});
      }}
    >
      <SectionCard
        title={t("person.livingStatusDeath.title")}
        contentClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
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
        {!isLiving && (
          <>
            <LabeledField label={t("person.livingStatusDeath.dateOfDeath")}>
              <HistoricalDateInput
                placeholder={t("person.livingStatusDeath.deathDatePlaceholder")}
                quality={deathQuality}
                onQualityChange={(quality) => form.setFieldValue("deathQuality", quality)}
                value={deathValue}
                onChange={(value) => form.setFieldValue("deathValue", value)}
                endValue={deathEndValue}
                onEndChange={(value) => form.setFieldValue("deathEndValue", value)}
                preview={historicalDateFieldPreview(
                  deathQuality,
                  deathValue,
                  deathEndValue,
                  language,
                )}
              />
            </LabeledField>
            <form.Field name="deathPlace">
              {(field) => (
                <LabeledField label={t("person.livingStatusDeath.placeOfDeath")}>
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </LabeledField>
              )}
            </form.Field>
            <LabeledField label={t("person.livingStatusDeath.burialDate")}>
              <HistoricalDateInput
                placeholder={t("person.livingStatusDeath.burialDatePlaceholder")}
                quality={burialQuality}
                onQualityChange={(quality) => form.setFieldValue("burialQuality", quality)}
                value={burialValue}
                onChange={(value) => form.setFieldValue("burialValue", value)}
                endValue={burialEndValue}
                onEndChange={(value) => form.setFieldValue("burialEndValue", value)}
                preview={historicalDateFieldPreview(
                  burialQuality,
                  burialValue,
                  burialEndValue,
                  language,
                )}
              />
            </LabeledField>
            <form.Field name="burialPlace">
              {(field) => (
                <LabeledField label={t("person.livingStatusDeath.burialPlace")}>
                  <Input
                    placeholder={t("person.livingStatusDeath.burialPlacePlaceholder")}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </LabeledField>
              )}
            </form.Field>
            <form.Field name="causeOfDeath">
              {(field) => (
                <LabeledField
                  label={t("person.livingStatusDeath.causeOfDeath")}
                  className="sm:col-span-2"
                >
                  <Input
                    placeholder={t("person.livingStatusDeath.causeOfDeathPlaceholder")}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </LabeledField>
              )}
            </form.Field>
          </>
        )}
      </SectionCard>
    </form>
  );
}
