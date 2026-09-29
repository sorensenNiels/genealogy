import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createImmichAlbum } from "../../server/functions/immich.functions";

export function NewAlbumDialog({ onCreated }: { onCreated: (albumId: string) => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <FormDialog trigger={<Button>{t("album.addAlbum")}</Button>} title={t("album.newAlbum")}>
      {(close) => (
        <NewAlbumForm
          onDone={async (albumId) => {
            close();
            await onCreated(albumId);
          }}
        />
      )}
    </FormDialog>
  );
}

function NewAlbumForm({ onDone }: { onDone: (albumId: string) => Promise<void> }) {
  const { t } = useTranslation();
  const createAlbumMutation = useMutation({ mutationFn: createImmichAlbum });

  const form = useForm({
    defaultValues: { albumName: "", description: "" },
    onSubmit: async ({ value }) => {
      const description = value.description.trim();
      const album = await createAlbumMutation.mutateAsync({
        data: { albumName: value.albumName.trim(), ...(description ? { description } : {}) },
      });
      await onDone(album.id);
    },
  });

  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const albumName = useStore(form.store, (state) => state.values.albumName);

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
      {createAlbumMutation.isError && (
        <p className="text-sm text-destructive">{createAlbumMutation.error.message}</p>
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting} isDisabled={albumName.trim() === ""}>
          {t("album.create")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
