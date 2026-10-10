import {
  joinHistoricalDateText,
  parseHistoricalDate,
  splitHistoricalDateText,
  type AlbumCoverStyle,
} from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { ColorSwatchPicker } from "@genealogy/ui/components/color-swatch-picker";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { historicalDateFieldPreview } from "../../lib/format-date";
import { usePermissions } from "../../lib/permissions";
import {
  type listImmichAlbums,
  updateImmichAlbum,
  updateImmichAlbumMetadata,
} from "../../server/functions/immich.functions";
import { AlbumCategoryPicker } from "./-album-categories";

export type AlbumWithMetadata = Awaited<ReturnType<typeof listImmichAlbums>>[number];

const COVER_COLORS = ["#2f4034", "#6b2b2b", "#4a3322", "#23344a", "#e3dccb", "#3b3b3f"];

export function EditAlbumDialog({
  album,
  onSaved,
  className,
}: {
  album: AlbumWithMetadata;
  onSaved: () => Promise<void>;
  className: string;
}) {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  if (!canEdit) return null;
  return (
    <FormDialog
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("album.editAlbumAria")}
          className={className}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      }
      title={t("album.editAlbum")}
    >
      {(close) => (
        <EditAlbumForm
          album={album}
          onDone={async () => {
            close();
            await onSaved();
          }}
        />
      )}
    </FormDialog>
  );
}

function EditAlbumForm({
  album,
  onDone,
}: {
  album: AlbumWithMetadata;
  onDone: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const isPhysical = album.kind === "physical";
  const updateAlbumMutation = useMutation({ mutationFn: updateImmichAlbum });
  const updateMetadataMutation = useMutation({ mutationFn: updateImmichAlbumMetadata });

  const dateSplit = splitHistoricalDateText(album.date?.original ?? "", language);

  const form = useForm({
    defaultValues: {
      albumName: album.albumName,
      description: album.description,
      dateQuality: dateSplit.quality,
      dateValue: dateSplit.value,
      dateEndValue: dateSplit.endValue,
      place: album.place ?? "",
      coverColor: album.cover?.color ?? COVER_COLORS[0]!,
      coverStyle: (album.cover?.style ?? "label") as AlbumCoverStyle,
      found: album.found ?? "",
      scanned: album.scanned ?? "",
      photosPerPage: album.photosPerPage,
      categoryIds: album.categoryIds,
    },
    onSubmit: async ({ value }) => {
      const dateOriginal = joinHistoricalDateText(
        {
          quality: value.dateQuality,
          value: value.dateValue,
          endValue: value.dateEndValue,
        },
        language,
      );
      const found = value.found.trim();
      const scanned = value.scanned.trim();
      await Promise.all([
        updateAlbumMutation.mutateAsync({
          data: {
            albumId: album.id,
            albumName: value.albumName.trim(),
            description: value.description.trim(),
          },
        }),
        updateMetadataMutation.mutateAsync({
          data: {
            albumId: album.id,
            date:
              dateOriginal === null
                ? null
                : { original: dateOriginal, ...parseHistoricalDate(dateOriginal, language) },
            place: value.place.trim() === "" ? null : value.place.trim(),
            categoryIds: value.categoryIds,
            ...(isPhysical
              ? {
                  cover: { color: value.coverColor, style: value.coverStyle },
                  found: found === "" ? null : found,
                  scanned: scanned === "" ? null : scanned,
                  photosPerPage: value.photosPerPage,
                }
              : {}),
          },
        }),
      ]);
      await onDone();
    },
  });

  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const dateQuality = useStore(form.store, (state) => state.values.dateQuality);
  const dateValue = useStore(form.store, (state) => state.values.dateValue);
  const dateEndValue = useStore(form.store, (state) => state.values.dateEndValue);
  const coverColor = useStore(form.store, (state) => state.values.coverColor);
  const coverStyle = useStore(form.store, (state) => state.values.coverStyle);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <LabeledField label={t("album.kindLabel")} asDiv>
        {/* Immutable after creation — see `-album-kind.ts`'s own comment for
            why: an in-place kind change would leave existing photos in a
            state the physical/virtual add-photo rules no longer make sense
            of. Shown for context, not as a form field. */}
        <Badge variant={isPhysical ? "default" : "outline"}>
          {isPhysical ? t("album.kindPhysical") : t("album.kindVirtual")}
        </Badge>
      </LabeledField>

      <form.Field name="albumName">
        {(field) => (
          <Input
            placeholder={t("album.albumName")}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <Input
            placeholder={t("album.descriptionOptional")}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <HistoricalDateInput
        placeholder={t("album.datePlaceholder")}
        quality={dateQuality}
        onQualityChange={(quality) => form.setFieldValue("dateQuality", quality)}
        value={dateValue}
        onChange={(value) => form.setFieldValue("dateValue", value)}
        endValue={dateEndValue}
        onEndChange={(value) => form.setFieldValue("dateEndValue", value)}
        preview={historicalDateFieldPreview(dateQuality, dateValue, dateEndValue, language)}
      />
      <form.Field name="place">
        {(field) => (
          <Input
            placeholder={t("common.place")}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>

      <LabeledField label={t("albumCategories.pickerLabel")} asDiv>
        <form.Field name="categoryIds">
          {(field) => (
            <AlbumCategoryPicker value={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>
      </LabeledField>

      {isPhysical && (
        <>
          <LabeledField label={t("album.coverColor")} asDiv>
            <ColorSwatchPicker
              aria-label={t("album.coverColor")}
              value={coverColor}
              onValueChange={(value) => form.setFieldValue("coverColor", value)}
              colors={COVER_COLORS}
            />
          </LabeledField>

          <LabeledField label={t("album.coverStyle")} asDiv>
            <ButtonRadioGroup
              value={coverStyle}
              onValueChange={(value) => form.setFieldValue("coverStyle", value)}
              options={[
                { value: "foil", label: t("album.coverStyleFoil") },
                { value: "label", label: t("album.coverStyleLabel") },
                { value: "tooled", label: t("album.coverStyleTooled") },
              ]}
            />
          </LabeledField>

          <form.Field name="found">
            {(field) => (
              <Input
                placeholder={t("album.foundPlaceholder")}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
          <form.Field name="scanned">
            {(field) => (
              <Input
                placeholder={t("album.scannedPlaceholder")}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
          <LabeledField label={t("album.photosPerPage")} asDiv>
            <form.Field name="photosPerPage">
              {(field) => (
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(Number(event.target.value) || 1)}
                />
              )}
            </form.Field>
          </LabeledField>
        </>
      )}

      {(updateAlbumMutation.isError || updateMetadataMutation.isError) && (
        <p className="text-sm text-destructive">
          {(updateAlbumMutation.error ?? updateMetadataMutation.error)?.message}
        </p>
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {t("common.save")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
