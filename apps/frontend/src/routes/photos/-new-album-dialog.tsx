import type { AlbumCoverStyle, AlbumKind } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { ColorSwatchPicker } from "@genealogy/ui/components/color-swatch-picker";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { usePermissions } from "../../lib/permissions";
import { createImmichAlbum } from "../../server/functions/immich.functions";
import { AlbumCategoryPicker } from "./-album-categories";

const COVER_COLORS = ["#2f4034", "#6b2b2b", "#4a3322", "#23344a", "#e3dccb", "#3b3b3f"];

/** `defaultCategoryIds` pre-checks the category the sidebar has selected, so "+ Add album" while viewing "Sørensen" files it there. */
export function NewAlbumDialog({
  defaultCategoryIds,
  onCreated,
}: {
  defaultCategoryIds: string[];
  onCreated: (albumId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  if (!canEdit) return null;
  return (
    <FormDialog trigger={<Button>{t("album.addAlbum")}</Button>} title={t("album.newAlbum")}>
      {(close) => (
        <NewAlbumForm
          defaultCategoryIds={defaultCategoryIds}
          onDone={async (albumId) => {
            close();
            await onCreated(albumId);
          }}
        />
      )}
    </FormDialog>
  );
}

function NewAlbumForm({
  defaultCategoryIds,
  onDone,
}: {
  defaultCategoryIds: string[];
  onDone: (albumId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const createAlbumMutation = useMutation({ mutationFn: createImmichAlbum });

  const form = useForm({
    defaultValues: {
      albumName: "",
      description: "",
      kind: "physical" as AlbumKind,
      coverColor: COVER_COLORS[0]!,
      coverStyle: "label" as AlbumCoverStyle,
      found: "",
      scanned: "",
      photosPerPage: 4,
      categoryIds: defaultCategoryIds,
    },
    onSubmit: async ({ value }) => {
      const description = value.description.trim();
      const found = value.found.trim();
      const scanned = value.scanned.trim();
      const album = await createAlbumMutation.mutateAsync({
        data: {
          albumName: value.albumName.trim(),
          kind: value.kind,
          photosPerPage: value.photosPerPage,
          categoryIds: value.categoryIds,
          ...(description ? { description } : {}),
          ...(value.kind === "physical"
            ? { cover: { color: value.coverColor, style: value.coverStyle } }
            : {}),
          ...(value.kind === "physical" && found ? { found } : {}),
          ...(value.kind === "physical" && scanned ? { scanned } : {}),
        },
      });
      await onDone(album.id);
    },
  });

  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const albumName = useStore(form.store, (state) => state.values.albumName);
  const kind = useStore(form.store, (state) => state.values.kind);
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
        <ButtonRadioGroup
          value={kind}
          onValueChange={(value) => form.setFieldValue("kind", value)}
          options={[
            { value: "physical", label: t("album.kindPhysical") },
            { value: "virtual", label: t("album.kindVirtual") },
          ]}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {kind === "physical"
            ? t("album.kindPhysicalDescription")
            : t("album.kindVirtualDescription")}
        </p>
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

      <LabeledField label={t("albumCategories.pickerLabel")} asDiv>
        <form.Field name="categoryIds">
          {(field) => (
            <AlbumCategoryPicker value={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>
      </LabeledField>

      {kind === "physical" && (
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

      {createAlbumMutation.isError && (
        <p className="text-sm text-destructive">{createAlbumMutation.error.message}</p>
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting} disabled={albumName.trim() === ""}>
          {t("album.create")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
