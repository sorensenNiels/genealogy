import type { AppRouter } from "@genealogy/backend";
import {
  configurableTopicSchema,
  type ConfigurableTopic,
  isAdmin,
  treeChartKindSchema,
  treeOrientationSchema,
  type PersonSettings,
  type TreeSettings,
} from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Switch } from "@genealogy/ui/components/switch";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { cn } from "@genealogy/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import type { TFunction } from "i18next";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { personSettingsQueryKey, usePersonSettingsQuery } from "../lib/person-settings";
import { treeSettingsQueryKey, useTreeSettingsQuery } from "../lib/tree-settings";
import {
  addOption,
  listOptions,
  moveOption,
  removeOption,
  updateOption,
  updatePersonSettings,
  updateTreeSettings,
} from "../server/functions/settings.functions";

// The enum always has at least one member, so this is never actually undefined.
const DEFAULT_TOPIC = configurableTopicSchema.options[0]!;

export const Route = createFileRoute("/settings")({
  // Admin-only (the backend enforces it too); anyone else goes home.
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.role)) throw redirect({ to: "/" });
  },
  // An unrecognized/missing topic (a stale bookmark, a typo'd URL) falls
  // back to the first topic rather than erroring — same reasoning as
  // tree.tsx's personId search param.
  // `section` picks a display-settings panel (just "tree" so far) instead of
  // a dropdown topic; with neither, the first topic shows, as before.
  validateSearch: (
    search: Record<string, unknown>,
  ): { topic?: ConfigurableTopic; section?: SettingsSection } => {
    if (search.section === "tree" || search.section === "person") {
      return { section: search.section };
    }
    const result = configurableTopicSchema.safeParse(search.topic);
    return result.success ? { topic: result.data } : {};
  },
  component: SettingsRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ConfigurableOptionRow = RouterOutputs["settings"]["listOptions"][number];

const LIST_OPTIONS_KEY = ["settings", "listOptions"];

type SettingsSection = "tree" | "person";

const NAV_LINK_CLASS =
  "rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
const NAV_LINK_ACTIVE_CLASS = "border-primary bg-accent font-medium text-foreground";

function topicLabels(t: TFunction): Record<ConfigurableTopic, string> {
  return {
    event_type: t("settings.topic.event_type"),
    name_variant_type: t("settings.topic.name_variant_type"),
    confidence: t("settings.topic.confidence"),
    union_status: t("settings.topic.union_status"),
    parentage: t("settings.topic.parentage"),
    research_note_type: t("settings.topic.research_note_type"),
    association_role: t("settings.topic.association_role"),
  };
}

function SettingsRoute() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { topic = DEFAULT_TOPIC, section } = Route.useSearch();
  const options = useQuery({ queryKey: LIST_OPTIONS_KEY, queryFn: () => listOptions() });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: LIST_OPTIONS_KEY });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="flex h-fit flex-col gap-6">
          <SectionCard title={t("settings.display")} titleClassName="text-base">
            <nav className="flex flex-col gap-1">
              <Link
                to="/settings"
                search={{ section: "tree" }}
                className={cn(NAV_LINK_CLASS, section === "tree" && NAV_LINK_ACTIVE_CLASS)}
              >
                {t("settings.tree.title")}
              </Link>
              <Link
                to="/settings"
                search={{ section: "person" }}
                className={cn(NAV_LINK_CLASS, section === "person" && NAV_LINK_ACTIVE_CLASS)}
              >
                {t("settings.person.title")}
              </Link>
            </nav>
          </SectionCard>
          <SectionCard title={t("settings.dropdowns")} titleClassName="text-base">
            <nav className="flex flex-col gap-1">
              {configurableTopicSchema.options.map((option) => (
                <Link
                  key={option}
                  to="/settings"
                  search={{ topic: option }}
                  className={cn(
                    NAV_LINK_CLASS,
                    !section && option === topic && NAV_LINK_ACTIVE_CLASS,
                  )}
                >
                  {topicLabels(t)[option]}
                </Link>
              ))}
            </nav>
          </SectionCard>
        </div>
        {section === "tree" ? (
          <TreeSettingsPanel />
        ) : section === "person" ? (
          <PersonSettingsPanel />
        ) : (
          <TopicPanel
            topic={topic}
            options={(options.data ?? []).filter((option) => option.topic === topic)}
            onChanged={refresh}
          />
        )}
      </div>
    </div>
  );
}

function PersonSettingsPanel() {
  const { t } = useTranslation();
  const settings = usePersonSettingsQuery();
  return (
    <SectionCard title={t("settings.person.title")} description={t("settings.person.description")}>
      {settings.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{settings.error.message}</p>
      ) : (
        <PersonSettingsForm initial={settings.data} />
      )}
    </SectionCard>
  );
}

/** Same shape as `TreeSettingsForm`: one form for the section, saved together. */
function PersonSettingsForm({ initial }: { initial: PersonSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateMutation = useMutation({ mutationFn: updatePersonSettings });

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      const saved = await updateMutation.mutateAsync({ data: value });
      queryClient.setQueryData(personSettingsQueryKey, saved);
      form.reset(saved);
    },
  });
  const { isDirty, isSubmitting } = useFormDirtyPending(form);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SettingsGroup>
        {(["openInEditMode", "showFamilyEventsInTimeline"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <SwitchSetting
                label={t(`settings.person.${name}`)}
                help={t(`settings.person.${name}Help`)}
                isSelected={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        ))}
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="presumeDeceasedAfterYears">
          {(field) => (
            <div className="space-y-2">
              <LabeledField label={t("settings.person.presumeDeceasedAfterYears")}>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  className="w-28"
                  value={String(field.state.value)}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    const years = Number.parseInt(event.target.value, 10);
                    field.handleChange(Number.isNaN(years) ? 0 : Math.min(200, Math.max(0, years)));
                  }}
                />
              </LabeledField>
              <p className="text-sm text-muted-foreground">
                {t("settings.person.presumeDeceasedAfterYearsHelp")}
              </p>
            </div>
          )}
        </form.Field>
      </SettingsGroup>

      {updateMutation.isError && (
        <p className="text-sm text-destructive">{updateMutation.error.message}</p>
      )}
      <SaveButton isDirty={isDirty} isPending={isSubmitting}>
        {t("common.save")}
      </SaveButton>
    </form>
  );
}

function TreeSettingsPanel() {
  const { t } = useTranslation();
  const settings = useTreeSettingsQuery();
  return (
    <SectionCard title={t("settings.tree.title")} description={t("settings.tree.description")}>
      {settings.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{settings.error.message}</p>
      ) : (
        <TreeSettingsForm initial={settings.data} />
      )}
    </SectionCard>
  );
}

/**
 * One form for the whole section, saved together — each new tree setting is
 * another `form.Field` here and a field with a default in
 * `treeSettingsSchema` (`@genealogy/core`).
 */
function TreeSettingsForm({ initial }: { initial: TreeSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateMutation = useMutation({ mutationFn: updateTreeSettings });

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      const saved = await updateMutation.mutateAsync({ data: value });
      queryClient.setQueryData(treeSettingsQueryKey, saved);
      // The saved values are the new baseline, so the dirty dot clears.
      form.reset(saved);
    },
  });
  const { isDirty, isSubmitting } = useFormDirtyPending(form);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SettingsGroup>
        {(["showPhotos", "showGenderBadge", "showMourningBand"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <SwitchSetting
                label={t(`settings.tree.${name}`)}
                help={t(`settings.tree.${name}Help`)}
                isSelected={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        ))}
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="dateDetail">
          {(field) => (
            <ChoiceSetting
              label={t("settings.tree.dateDetail")}
              help={t("settings.tree.dateDetailHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "years", label: t("settings.tree.dateDetailYears") },
                { value: "full", label: t("settings.tree.dateDetailFull") },
              ]}
            />
          )}
        </form.Field>
        <form.Field name="highlightDirectLine">
          {(field) => (
            <SwitchSetting
              label={t("settings.tree.highlightDirectLine")}
              help={t("settings.tree.highlightDirectLineHelp")}
              isSelected={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
      </SettingsGroup>

      <SettingsGroup>
        {(["showMinimap", "animateTransitions", "rememberLastView"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <SwitchSetting
                label={t(`settings.tree.${name}`)}
                help={t(`settings.tree.${name}Help`)}
                isSelected={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        ))}
        <form.Field name="initialZoom">
          {(field) => (
            <ChoiceSetting
              label={t("settings.tree.initialZoom")}
              help={t("settings.tree.initialZoomHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "fit", label: t("settings.tree.initialZoomFit") },
                { value: "person", label: t("settings.tree.initialZoomPerson") },
              ]}
            />
          )}
        </form.Field>
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="defaultChart">
          {(field) => (
            <ChoiceSetting
              label={t("settings.tree.defaultChart")}
              value={field.state.value}
              onChange={field.handleChange}
              options={treeChartKindSchema.options.map((kind) => ({
                value: kind,
                label: t(`tree.view.${kind}`),
              }))}
            />
          )}
        </form.Field>
        <form.Field name="defaultOrientation">
          {(field) => (
            <ChoiceSetting
              label={t("settings.tree.defaultOrientation")}
              help={t("settings.tree.defaultsHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={treeOrientationSchema.options.map((orientation) => ({
                value: orientation,
                label: t(`tree.orientation.${orientation}`),
              }))}
            />
          )}
        </form.Field>
      </SettingsGroup>

      {updateMutation.isError && (
        <p className="text-sm text-destructive">{updateMutation.error.message}</p>
      )}
      <SaveButton isDirty={isDirty} isPending={isSubmitting}>
        {t("common.save")}
      </SaveButton>
    </form>
  );
}

/** A run of related settings, separated from the next by a rule. */
function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-5 border-b pb-6 last-of-type:border-b-0">{children}</div>;
}

function SwitchSetting({
  label,
  help,
  isSelected,
  onChange,
}: {
  label: string;
  help: string;
  isSelected: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <Switch isSelected={isSelected} onChange={onChange}>
        {label}
      </Switch>
      <p className="pl-11 text-sm text-muted-foreground">{help}</p>
    </div>
  );
}

function ChoiceSetting<T extends string>({
  label,
  help,
  value,
  onChange,
  options,
}: {
  label: string;
  help?: string;
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <ButtonRadioGroup aria-label={label} value={value} onChange={onChange} options={options} />
      {help && <p className="text-sm text-muted-foreground">{help}</p>}
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
  const { t } = useTranslation();
  return (
    <SectionCard
      title={topicLabels(t)[topic]}
      contentClassName="space-y-2"
      action={
        <FormDialog
          trigger={
            <Button variant="outline" size="sm">
              {t("settings.add")}
            </Button>
          }
          title={t("settings.addOptionTitle", { topic: topicLabels(t)[topic].toLowerCase() })}
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
      {options.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("settings.noneRecorded")}</p>
      )}
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
  const { t } = useTranslation();
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
            aria-label={t("settings.moveUp")}
            isDisabled={isFirst}
            onPress={() => void move("up")}
          >
            <ChevronUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("settings.moveDown")}
            isDisabled={isLast}
            onPress={() => void move("down")}
          >
            <ChevronDownIcon className="size-4" />
          </Button>
          <FormDialog
            trigger={
              <Button variant="ghost" size="sm">
                {t("common.edit")}
              </Button>
            }
            title={t("settings.editOption")}
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
            <span className="text-xs text-muted-foreground">{t("settings.builtIn")}</span>
          ) : (
            <RemoveButton
              itemLabel={`"${option.label}"`}
              description={t("settings.removeOptionDescription")}
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
  const { t } = useTranslation();
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
            placeholder={t("settings.keyPlaceholder")}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="label">
        {(field) => (
          <Input
            placeholder={t("settings.labelPlaceholder")}
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
          {t("common.add")}
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
  const { t } = useTranslation();
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
      <LabeledStatic label={t("settings.keyLabel")} value={option.key} />
      <form.Field name="label">
        {(field) => (
          <Input
            placeholder={t("settings.labelOnly")}
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
          {t("common.save")}
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
