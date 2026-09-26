import type { AppRouter } from "@genealogy/backend";
import { configurableTopicSchema, TOPIC_LABELS, type ConfigurableTopic } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { cn } from "@genealogy/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import {
  addOption,
  listOptions,
  moveOption,
  removeOption,
  updateOption,
} from "../server/functions/settings.functions";

// The enum always has at least one member, so this is never actually undefined.
const DEFAULT_TOPIC = configurableTopicSchema.options[0]!;

export const Route = createFileRoute("/settings")({
  // An unrecognized/missing topic (a stale bookmark, a typo'd URL) falls
  // back to the first topic rather than erroring — same reasoning as
  // tree.tsx's personId search param.
  validateSearch: (search: Record<string, unknown>): { topic?: ConfigurableTopic } => {
    const result = configurableTopicSchema.safeParse(search.topic);
    return result.success ? { topic: result.data } : {};
  },
  component: SettingsRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ConfigurableOptionRow = RouterOutputs["settings"]["listOptions"][number];

const LIST_OPTIONS_KEY = ["settings", "listOptions"];

function SettingsRoute() {
  const queryClient = useQueryClient();
  const { topic = DEFAULT_TOPIC } = Route.useSearch();
  const options = useQuery({ queryKey: LIST_OPTIONS_KEY, queryFn: () => listOptions() });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: LIST_OPTIONS_KEY });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <SectionCard title="Categories" titleClassName="text-base" className="h-fit">
          <nav className="flex flex-col gap-1">
            {configurableTopicSchema.options.map((option) => (
              <Link
                key={option}
                to="/settings"
                search={{ topic: option }}
                className={cn(
                  "rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  option === topic && "border-primary bg-accent font-medium text-foreground",
                )}
              >
                {TOPIC_LABELS[option]}
              </Link>
            ))}
          </nav>
        </SectionCard>
        <TopicPanel
          topic={topic}
          options={(options.data ?? []).filter((option) => option.topic === topic)}
          onChanged={refresh}
        />
      </div>
    </div>
  );
}

function TopicPanel({
  topic,
  options,
  onChanged,
}: {
  topic: ConfigurableTopic;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  return (
    <SectionCard
      title={TOPIC_LABELS[topic]}
      contentClassName="space-y-2"
      action={
        <FormDialog
          trigger={
            <Button variant="outline" size="sm">
              + Add
            </Button>
          }
          title={`Add ${TOPIC_LABELS[topic].toLowerCase()} option`}
        >
          {(close) => (
            <AddOptionForm
              topic={topic}
              onDone={async () => {
                close();
                await onChanged();
              }}
            />
          )}
        </FormDialog>
      }
    >
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
    </SectionCard>
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
          <FormDialog
            trigger={
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            }
            title="Edit option"
          >
            {(close) => (
              <EditOptionForm
                option={option}
                onDone={async () => {
                  close();
                  await onChanged();
                }}
              />
            )}
          </FormDialog>
          {option.isProtected ? (
            <span className="text-xs text-muted-foreground">Built-in</span>
          ) : (
            <RemoveButton
              itemLabel={`"${option.label}"`}
              description="This cannot be undone. Removal is refused if any record still uses it."
              onConfirm={() => void remove()}
            />
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

  const { isDirty, isSubmitting } = useFormDirtyPending(form);

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

  const { isDirty, isSubmitting } = useFormDirtyPending(form);

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
