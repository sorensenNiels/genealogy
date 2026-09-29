import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
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
import { Switch } from "@genealogy/ui/components/switch";
import { Tooltip, TooltipContent } from "@genealogy/ui/components/tooltip";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { labelFor, optionsFor } from "../../lib/person-display";
import { addNote, removeNote, updateNote } from "../../server/functions/research-note.functions";
import type { ConfigurableOptionRow, ResearchNoteRow } from "./-types";

/**
 * Research to-dos: an open question to chase down later, or a plain note —
 * see `resolved` on `researchNoteSchema` for why closing one is a status
 * flip rather than a retype/delete.
 */
export function ResearchNotesSection({
  personId,
  notes,
  options,
  onChanged,
}: {
  personId: string;
  notes: ResearchNoteRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const updateNoteMutation = useMutation({ mutationFn: updateNote });
  const removeNoteMutation = useMutation({ mutationFn: removeNote });

  const toggleResolved = async (note: ResearchNoteRow) => {
    await updateNoteMutation.mutateAsync({ data: { id: note.id, resolved: !note.resolved } });
    await onChanged();
  };

  const remove = async (id: string) => {
    await removeNoteMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  return (
    <SectionCard
      title={t("person.researchNotes.title")}
      titleClassName="text-base"
      contentClassName="space-y-4"
      action={
        <FormDialog
          trigger={
            <Tooltip>
              <Button variant="outline" size="icon" aria-label={t("person.researchNotes.addNote")}>
                <PlusIcon className="size-4" />
              </Button>
              <TooltipContent>{t("person.researchNotes.addNote")}</TooltipContent>
            </Tooltip>
          }
          title={t("person.researchNotes.addNote")}
        >
          {(close) => (
            <ResearchNoteForm
              personId={personId}
              options={options}
              onDone={async () => {
                close();
                await onChanged();
              }}
            />
          )}
        </FormDialog>
      }
    >
      {notes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("person.researchNotes.empty")}</p>
      )}
      {notes.map((note) => (
        <div key={note.id} className="space-y-1 border-b pb-3 last:border-b-0 last:pb-0">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={note.resolved ? "outline" : "secondary"}>
              {labelFor(options, "research_note_type", note.noteType)}
            </Badge>
            <div className="flex items-center gap-2">
              <Switch isSelected={note.resolved} onChange={() => void toggleResolved(note)}>
                {t("person.researchNotes.resolved")}
              </Switch>
              <RemoveButton
                itemLabel={t("person.researchNotes.thisNote")}
                onConfirm={() => void remove(note.id)}
              />
            </div>
          </div>
          <MarkdownContent className="text-sm">{note.body}</MarkdownContent>
        </div>
      ))}
    </SectionCard>
  );
}

function ResearchNoteForm({
  personId,
  options,
  onDone,
}: {
  personId: string;
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const addNoteMutation = useMutation({ mutationFn: addNote });
  const noteTypeOptions = optionsFor(options, "research_note_type");
  const [noteType, setNoteType] = useState(noteTypeOptions[0]?.key ?? "note");
  const [body, setBody] = useState("");

  const canSubmit = body.trim() !== "";

  const submit = async () => {
    await addNoteMutation.mutateAsync({ data: { personId, noteType, body: body.trim() } });
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
      <Select
        aria-label={t("person.researchNotes.noteType")}
        value={noteType}
        onChange={(value) => {
          if (value) setNoteType(String(value));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {noteTypeOptions.map((option) => (
            <SelectItem key={option.key} id={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MarkdownEditor
        value={body}
        onChange={setBody}
        aria-label={t("person.researchNotes.noteAriaLabel")}
      />
      <DialogFooter>
        <SaveButton
          isDirty={body.trim() !== ""}
          isPending={addNoteMutation.isPending}
          isDisabled={!canSubmit}
        >
          {t("common.add")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
