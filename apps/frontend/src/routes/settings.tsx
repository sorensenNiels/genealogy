import type { AppRouter } from "@genealogy/backend";
import { configurableTopicSchema, TOPIC_LABELS, type ConfigurableTopic } from "@genealogy/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@genealogy/ui/components/alert-dialog";
import { Button } from "@genealogy/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@genealogy/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@genealogy/ui/components/dialog";
import { Input } from "@genealogy/ui/components/input";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";

import {
  addOption,
  listOptions,
  moveOption,
  removeOption,
  updateOption,
} from "../server/functions/settings.functions";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ConfigurableOptionRow = RouterOutputs["settings"]["listOptions"][number];

const LIST_OPTIONS_KEY = ["settings", "listOptions"];

function SettingsRoute() {
  const queryClient = useQueryClient();
  const options = useQuery({ queryKey: LIST_OPTIONS_KEY, queryFn: () => listOptions() });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: LIST_OPTIONS_KEY });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The options offered in dropdowns across the app — add, relabel, reorder or remove them
          here instead of needing a code change.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {configurableTopicSchema.options.map((topic) => (
          <TopicCard
            key={topic}
            topic={topic}
            options={(options.data ?? []).filter((option) => option.topic === topic)}
            onChanged={refresh}
          />
        ))}
      </div>
    </div>
  );
}

function TopicCard({
  topic,
  options,
  onChanged,
}: {
  topic: ConfigurableTopic;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{TOPIC_LABELS[topic]}</CardTitle>
        <Dialog isOpen={addOpen} onOpenChange={setAddOpen}>
          <Button variant="outline" size="sm">
            + Add
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add {TOPIC_LABELS[topic].toLowerCase()} option</DialogTitle>
            </DialogHeader>
            <AddOptionForm
              topic={topic}
              onDone={async () => {
                setAddOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {options.length === 0 && <p className="text-sm text-muted-foreground">None recorded.</p>}
        {options.map((option, index) => (
          <OptionRow
            key={option.id}
            option={option}
            isFirst={index === 0}
            isLast={index === options.length - 1}
            onChanged={onChanged}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function OptionRow({
  option,
  isFirst,
  isLast,
  onChanged,
}: {
  option: ConfigurableOptionRow;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => Promise<void>;
}) {
  const moveOptionMutation = useMutation({ mutationFn: moveOption });
  const removeOptionMutation = useMutation({ mutationFn: removeOption });
  const [editOpen, setEditOpen] = useState(false);

  const move = async (direction: "up" | "down") => {
    await moveOptionMutation.mutateAsync({ data: { id: option.id, direction } });
    await onChanged();
  };

  const remove = async () => {
    await removeOptionMutation.mutateAsync({ data: { id: option.id } });
    await onChanged();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <div>
          <span>{option.label}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">{option.key}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move up"
            isDisabled={isFirst}
            onPress={() => void move("up")}
          >
            <ChevronUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move down"
            isDisabled={isLast}
            onPress={() => void move("down")}
          >
            <ChevronDownIcon className="size-4" />
          </Button>
          <Dialog isOpen={editOpen} onOpenChange={setEditOpen}>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit option</DialogTitle>
              </DialogHeader>
              <EditOptionForm
                option={option}
                onDone={async () => {
                  setEditOpen(false);
                  await onChanged();
                }}
              />
            </DialogContent>
          </Dialog>
          {option.isProtected ? (
            <span className="text-xs text-muted-foreground">Built-in</span>
          ) : (
            <AlertDialog>
              <Button variant="ghost" size="sm">
                Remove
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove "{option.label}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. Removal is refused if any record still uses it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onPress={() => void remove()}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      {/* Rendered here rather than inside AlertDialogContent: AlertDialogAction
          closes the dialog on press (slot="close") independently of whether
          `remove()` throws, so an error shown inside it would flash and
          vanish before it could be read. */}
      {removeOptionMutation.isError && (
        <p className="text-right text-sm text-destructive">{removeOptionMutation.error.message}</p>
      )}
    </div>
  );
}

function AddOptionForm({
  topic,
  onDone,
}: {
  topic: ConfigurableTopic;
  onDone: () => Promise<void>;
}) {
  const addOptionMutation = useMutation({ mutationFn: addOption });

  const form = useForm({
    defaultValues: { key: "", label: "" },
    onSubmit: async ({ value }) => {
      await addOptionMutation.mutateAsync({
        data: { topic, key: value.key.trim(), label: value.label.trim() },
      });
      await onDone();
    },
  });

  const isDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="key">
        {(field) => (
          <Input
            placeholder="Key, e.g. graduation (lowercase, no spaces)"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="label">
        {(field) => (
          <Input
            placeholder="Label, e.g. Graduation"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      {addOptionMutation.isError && (
        <p className="text-sm text-destructive">{addOptionMutation.error.message}</p>
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          Add
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

function EditOptionForm({
  option,
  onDone,
}: {
  option: ConfigurableOptionRow;
  onDone: () => Promise<void>;
}) {
  const updateOptionMutation = useMutation({ mutationFn: updateOption });

  const form = useForm({
    defaultValues: { label: option.label },
    onSubmit: async ({ value }) => {
      await updateOptionMutation.mutateAsync({
        data: { id: option.id, label: value.label.trim() },
      });
      await onDone();
    },
  });

  const isDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <LabeledStatic label="Key" value={option.key} />
      <form.Field name="label">
        {(field) => (
          <Input
            placeholder="Label"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      {updateOptionMutation.isError && (
        <p className="text-sm text-destructive">{updateOptionMutation.error.message}</p>
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          Save
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

/** The key never changes after creation (see the `configurableOptions` schema comment) — shown read-only for context while editing the label. */
function LabeledStatic({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {label}: <span className="font-mono">{value}</span>
    </p>
  );
}
