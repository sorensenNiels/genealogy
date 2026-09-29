import {
  joinHistoricalDateText,
  parseHistoricalDate,
  splitHistoricalDateText,
} from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
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

/** Birth date and place — its own form/mutation/Save/Cancel; see the comment on `NamesGenderCard`. */
export function BirthCard({
  person,
  onChanged,
}: {
  person: PersonRow;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const updatePersonMutation = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });
  const birthSplit = splitHistoricalDateText(person.birth?.original ?? "", language);

  const form = useForm({
    defaultValues: {
      birthQuality: birthSplit.quality,
      birthValue: birthSplit.value,
      birthEndValue: birthSplit.endValue,
      birthPlace: person.birthPlace ?? "",
    },
    onSubmit: async ({ value, formApi }) => {
      const birthOriginal = joinHistoricalDateText(
        {
          quality: value.birthQuality,
          value: value.birthValue,
          endValue: value.birthEndValue,
        },
        language,
      );
      await updatePersonMutation.mutateAsync({
        data: {
          id: person.id,
          // Bounds are recomputed from the current wording on every save, not
          // carried over from what was previously stored — otherwise editing
          // the text alone (without it happening to still parse to the same
          // bounds) would leave a stale earliest/latest attached to new words.
          birth:
            birthOriginal === null
              ? null
              : { original: birthOriginal, ...parseHistoricalDate(birthOriginal, language) },
          birthPlace: value.birthPlace.trim() === "" ? null : value.birthPlace,
        },
      });
      formApi.reset(value);
    },
  });

  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const birthQuality = useStore(form.store, (state) => state.values.birthQuality);
  const birthValue = useStore(form.store, (state) => state.values.birthValue);
  const birthEndValue = useStore(form.store, (state) => state.values.birthEndValue);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit().catch(() => {});
      }}
    >
      <SectionCard
        title={t("person.birth.title")}
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
        <LabeledField label={t("person.birth.dateOfBirth")}>
          <HistoricalDateInput
            placeholder={t("person.birth.datePlaceholder")}
            quality={birthQuality}
            onQualityChange={(quality) => form.setFieldValue("birthQuality", quality)}
            value={birthValue}
            onChange={(value) => form.setFieldValue("birthValue", value)}
            endValue={birthEndValue}
            onEndChange={(value) => form.setFieldValue("birthEndValue", value)}
            preview={historicalDateFieldPreview(birthQuality, birthValue, birthEndValue, language)}
          />
        </LabeledField>
        <form.Field name="birthPlace">
          {(field) => (
            <LabeledField label={t("person.birth.placeOfBirth")}>
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </LabeledField>
          )}
        </form.Field>
      </SectionCard>
    </form>
  );
}
