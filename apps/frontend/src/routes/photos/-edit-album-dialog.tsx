import {
  joinHistoricalDateText,
  parseHistoricalDate,
  splitHistoricalDateText,
} from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { TagInput } from "@genealogy/ui/components/tag-input";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { historicalDateFieldPreview } from "../../lib/format-date";
import {
  listImmichAlbumTags,
  type listImmichAlbums,
  updateImmichAlbum,
  updateImmichAlbumMetadata,
} from "../../server/functions/immich.functions";

export type AlbumWithMetadata = Awaited<ReturnType<typeof listImmichAlbums>>[number];

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
  const updateAlbumMutation = useMutation({ mutationFn: updateImmichAlbum });
  const updateMetadataMutation = useMutation({ mutationFn: updateImmichAlbumMetadata });
  const tagsQuery = useQuery({
    queryKey: ["immich", "albumTags"],
    queryFn: () => listImmichAlbumTags(),
  });

  const dateSplit = splitHistoricalDateText(album.date?.original ?? "", language);

  const form = useForm({
    defaultValues: {
      albumName: album.albumName,
      description: album.description,
      dateQuality: dateSplit.quality,
      dateValue: dateSplit.value,
      dateEndValue: dateSplit.endValue,
      place: album.place ?? "",
      tags: album.tags,
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
            tags: value.tags,
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

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
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
      <form.Field name="tags">
        {(field) => (
          <TagInput
            value={field.state.value}
            onChange={field.handleChange}
            suggestions={tagsQuery.data ?? []}
          />
        )}
      </form.Field>
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
