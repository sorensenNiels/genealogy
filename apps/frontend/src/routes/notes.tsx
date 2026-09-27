import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import {
  addUserNote,
  listUserNotes,
  removeUserNote,
  updateUserNote,
} from "../server/functions/user-note.functions";

export const Route = createFileRoute("/notes")({
  component: NotesRoute,
});

type UserNoteRow = Awaited<ReturnType<typeof listUserNotes>>[number];

const LIST_NOTES_KEY = ["userNote", "list"];

function NotesRoute() {
  const queryClient = useQueryClient();
  const notes = useQuery({ queryKey: LIST_NOTES_KEY, queryFn: () => listUserNotes() });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: LIST_NOTES_KEY });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">My Notes</h1>
        <FormDialog
          trigger={
            <Button>
              <PlusIcon className="size-4" /> Add note
            </Button>
          }
          title="Add note"
        >
          {(close) => (
            <NoteForm
              note={null}
              onDone={async () => {
                close();
                await refresh();
              }}
            />
          )}
        </FormDialog>
      </div>

      {notes.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {notes.isError && (
        <p className="text-sm text-destructive">Could not load notes: {notes.error.message}</p>
      )}
      {notes.data && notes.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No notes yet — add one to keep track of anything that doesn't belong on a person record.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {notes.data?.map((note) => (
          <NoteCard key={note.id} note={note} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note, onChanged }: { note: UserNoteRow; onChanged: () => Promise<void> }) {
  const removeNoteMutation = useMutation({ mutationFn: removeUserNote });

  const remove = async () => {
    await removeNoteMutation.mutateAsync({ data: { id: note.id } });
    await onChanged();
  };

  return (
    <SectionCard
      title={note.title.trim() === "" ? "Untitled" : note.title}
      titleClassName="text-base"
      contentClassName="max-h-64 overflow-y-auto"
      footerClassName="justify-end"
      action={
        <FormDialog
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label="Edit note">
              <PencilIcon className="size-4" />
            </Button>
          }
          title="Edit note"
        >
          {(close) => (
            <NoteForm
              note={note}
              onDone={async () => {
                close();
                await onChanged();
              }}
            />
          )}
        </FormDialog>
      }
      footer={
        <RemoveButton
          itemLabel={note.title.trim() === "" ? "this note" : `"${note.title}"`}
          onConfirm={() => void remove()}
        />
      }
    >
      <MarkdownContent className="text-sm">{note.body}</MarkdownContent>
      {removeNoteMutation.isError && (
        <p className="mt-2 text-sm text-destructive">{removeNoteMutation.error.message}</p>
      )}
    </SectionCard>
  );
}

function NoteForm({ note, onDone }: { note: UserNoteRow | null; onDone: () => Promise<void> }) {
  const addNoteMutation = useMutation({ mutationFn: addUserNote });
  const updateNoteMutation = useMutation({ mutationFn: updateUserNote });
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");

  const canSubmit = body.trim() !== "";
  const isPending = addNoteMutation.isPending || updateNoteMutation.isPending;
  const submitError = addNoteMutation.error ?? updateNoteMutation.error;

  const submit = async () => {
    if (note) {
      await updateNoteMutation.mutateAsync({
        data: { id: note.id, title: title.trim(), body: body.trim() },
      });
    } else {
      await addNoteMutation.mutateAsync({ data: { title: title.trim(), body: body.trim() } });
    }
    await onDone();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        placeholder="Title (optional)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <MarkdownEditor value={body} onChange={setBody} aria-label="Note" />
      {submitError && <p className="text-sm text-destructive">{submitError.message}</p>}
      <DialogFooter>
        <SaveButton isDirty={canSubmit} isPending={isPending} isDisabled={!canSubmit}>
          {note ? "Save" : "Add"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
