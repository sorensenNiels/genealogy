import type { AppRouter } from "@genealogy/backend";
import {
  allCensuses,
  BUILT_IN_CENSUS_COUNTRIES,
  type CensusDefinition,
  censusDefinitionSchema,
  configurableTopicSchema,
  type ConfigurableTopic,
  isAdmin,
  onThisDayEventSchema,
  OVERVIEW_CARD_ROLE,
  overviewCardSchema,
  type OverviewSettings,
  peopleListColumnSchema,
  peopleListGroupingSchema,
  type PeopleListSettings,
  personListSortSchema,
  treeChartKindSchema,
  treeOrientationSchema,
  ALWAYS_SHOWN_PERSON_CARDS,
  PERSON_SIDE_CARDS,
  type PersonCard,
  personCardSchema,
  type PersonSettings,
  recordTypeSchema,
  type RecordSettings,
  type TreeSettings,
} from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Select } from "@genealogy/ui/components/select";
import { Switch } from "@genealogy/ui/components/switch";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { cn } from "@genealogy/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import type { TFunction } from "i18next";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { overviewCardLabel } from "../lib/overview-cards";
import { optionsFor } from "../lib/person-display";
import { personSettingsQueryKey, usePersonSettingsQuery } from "../lib/person-settings";
import { overviewSettingsQuery, peopleListSettingsQuery } from "../lib/queries";
import { recordSettingsQueryKey, useRecordSettingsQuery } from "../lib/record-settings";
import { treeSettingsQueryKey, useTreeSettingsQuery } from "../lib/tree-settings";
import {
  addOption,
  listOptions,
  moveOption,
  removeOption,
  updateOption,
  updatePeopleListSettings,
  updateOverviewSettings,
  updatePersonSettings,
  updateRecordSettings,
  updateTreeSettings,
} from "../server/functions/settings.functions";
import { AppearanceSettingsPanel } from "./-appearance-settings";

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
    if (
      search.section === "overview" ||
      search.section === "tree" ||
      search.section === "person" ||
      search.section === "peopleList" ||
      search.section === "records" ||
      search.section === "appearance"
    ) {
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

type SettingsSection = "overview" | "tree" | "person" | "peopleList" | "records" | "appearance";

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
    household_position: t("settings.topic.household_position"),
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
                search={{ section: "overview" }}
                className={cn(NAV_LINK_CLASS, section === "overview" && NAV_LINK_ACTIVE_CLASS)}
              >
                {t("settings.overview.title")}
              </Link>
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
              <Link
                to="/settings"
                search={{ section: "peopleList" }}
                className={cn(NAV_LINK_CLASS, section === "peopleList" && NAV_LINK_ACTIVE_CLASS)}
              >
                {t("settings.peopleList.title")}
              </Link>
              <Link
                to="/settings"
                search={{ section: "records" }}
                className={cn(NAV_LINK_CLASS, section === "records" && NAV_LINK_ACTIVE_CLASS)}
              >
                {t("settings.records.title")}
              </Link>
              <Link
                to="/settings"
                search={{ section: "appearance" }}
                className={cn(NAV_LINK_CLASS, section === "appearance" && NAV_LINK_ACTIVE_CLASS)}
              >
                {t("appearance.title")}
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
        {section === "overview" ? (
          <OverviewSettingsPanel />
        ) : section === "tree" ? (
          <TreeSettingsPanel />
        ) : section === "person" ? (
          <PersonSettingsPanel />
        ) : section === "peopleList" ? (
          <PeopleListSettingsPanel />
        ) : section === "records" ? (
          <RecordSettingsPanel options={options.data ?? []} />
        ) : section === "appearance" ? (
          <AppearanceSettingsPanel />
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
      // The Family card's scope and what Viewers see of the living change
      // what the server returns for people, not just how it's shown.
      await queryClient.invalidateQueries({ queryKey: ["person"] });
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
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
                description={t(`settings.person.${name}Help`)}
              >
                {t(`settings.person.${name}`)}
              </Switch>
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

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.person.consistency")}</p>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["minParentAge", 30],
                ["maxMotherAge", 80],
                ["minMarriageAge", 30],
              ] as const
            ).map(([name, max]) => (
              <form.Field key={name} name={name}>
                {(field) => (
                  <LabeledField label={t(`settings.person.${name}`)}>
                    <Input
                      type="number"
                      min={0}
                      max={max}
                      className="w-28"
                      value={String(field.state.value)}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        const years = Number.parseInt(event.target.value, 10);
                        field.handleChange(
                          Number.isNaN(years) ? 0 : Math.min(max, Math.max(0, years)),
                        );
                      }}
                    />
                  </LabeledField>
                )}
              </form.Field>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{t("settings.person.consistencyHelp")}</p>
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.person.cards")}</p>
          <form.Field name="cardOrder">
            {(orderField) => (
              <form.Field name="hiddenCards">
                {(hiddenField) => (
                  <CardOrderSetting
                    order={orderField.state.value}
                    hidden={hiddenField.state.value}
                    onOrderChange={orderField.handleChange}
                    onHiddenChange={hiddenField.handleChange}
                  />
                )}
              </form.Field>
            )}
          </form.Field>
          <p className="text-sm text-muted-foreground">{t("settings.person.cardsHelp")}</p>
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="nameFormat">
          {(field) => (
            <ChoiceSetting
              label={t("settings.person.nameFormat")}
              help={t("settings.person.nameFormatHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "givenFirst", label: t("settings.person.nameFormatGivenFirst") },
                { value: "surnameFirst", label: t("settings.person.nameFormatSurnameFirst") },
                { value: "surnameCapitals", label: t("settings.person.nameFormatSurnameCapitals") },
              ]}
            />
          )}
        </form.Field>
        <form.Field name="dateDetail">
          {(field) => (
            <ChoiceSetting
              label={t("settings.person.dateDetail")}
              help={t("settings.person.dateDetailHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "full", label: t("settings.tree.dateDetailFull") },
                { value: "years", label: t("settings.tree.dateDetailYears") },
              ]}
            />
          )}
        </form.Field>
        <form.Field name="showAges">
          {(field) => (
            <Switch
              checked={field.state.value}
              onCheckedChange={field.handleChange}
              description={t("settings.person.showAgesHelp")}
            >
              {t("settings.person.showAges")}
            </Switch>
          )}
        </form.Field>
      </SettingsGroup>

      <SettingsGroup>
        <p className="text-sm font-medium">{t("settings.person.familyScope")}</p>
        {(["showHalfSiblings", "showStepRelations", "showInLaws"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
                description={t(`settings.person.${name}Help`)}
              >
                {t(`settings.person.${name}`)}
              </Switch>
            )}
          </form.Field>
        ))}
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="viewerLivingDetail">
          {(field) => (
            <ChoiceSetting
              label={t("settings.person.viewerLivingDetail")}
              help={t("settings.person.viewerLivingDetailHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "name", label: t("settings.person.viewerLivingName") },
                {
                  value: "nameAndBirthYear",
                  label: t("settings.person.viewerLivingNameAndBirthYear"),
                },
                { value: "hidden", label: t("settings.person.viewerLivingHidden") },
              ]}
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

/**
 * The person page's cards, a list per column: a box to show or hide each
 * (not Personal details or Family) and arrows to move it within its
 * column — the column a card sits in is fixed (`PERSON_SIDE_CARDS`).
 */
function CardOrderSetting({
  order,
  hidden,
  onOrderChange,
  onHiddenChange,
}: {
  order: PersonCard[];
  hidden: PersonCard[];
  onOrderChange: (next: PersonCard[]) => void;
  onHiddenChange: (next: PersonCard[]) => void;
}) {
  const { t } = useTranslation();
  // Every card, a card added since the order was saved included.
  const full = [...new Set([...order, ...personCardSchema.options])];
  const columns = [
    { side: false, title: t("settings.person.mainColumn") },
    { side: true, title: t("settings.person.sideColumn") },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {columns.map(({ side, title }) => (
        <div key={title} className="space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <OrderedCardList
            cards={full.filter((card) => PERSON_SIDE_CARDS.includes(card) === side)}
            hidden={hidden}
            alwaysShown={ALWAYS_SHOWN_PERSON_CARDS}
            label={(card) => t(`settings.person.card.${card}`)}
            onMove={(card, neighbour) => onOrderChange(swapped(full, card, neighbour))}
            onHiddenChange={onHiddenChange}
          />
        </div>
      ))}
    </div>
  );
}

/** `list` with `a` and `b` changing places. */
function swapped<T>(list: readonly T[], a: T, b: T): T[] {
  return list.map((item) => (item === a ? b : item === b ? a : item));
}

/**
 * Cards in order, each with a box to show or hide it and arrows to move
 * it past its neighbour — the person page's and the Overview's card
 * choosers. `onMove` gets the card and the one it trades places with.
 */
function OrderedCardList<T extends string>({
  cards,
  hidden,
  alwaysShown = [],
  label,
  note,
  onMove,
  onHiddenChange,
}: {
  cards: T[];
  hidden: T[];
  alwaysShown?: readonly T[];
  label: (card: T) => string;
  /** A small aside after a card's name — who it's for, say. */
  note?: (card: T) => string | null;
  onMove: (card: T, neighbour: T) => void;
  onHiddenChange: (next: T[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      {cards.map((card, index) => {
        const name = label(card);
        const aside = note?.(card);
        return (
          <div key={card} className="flex items-center justify-between gap-2 text-sm">
            {alwaysShown.includes(card) ? (
              <span>
                {name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("settings.person.alwaysShown")}
                </span>
              </span>
            ) : (
              <Checkbox
                checked={!hidden.includes(card)}
                onCheckedChange={(checked) =>
                  onHiddenChange(
                    checked ? hidden.filter((other) => other !== card) : [...hidden, card],
                  )
                }
              >
                {name}
                {aside && <span className="ml-2 text-xs text-muted-foreground">{aside}</span>}
              </Checkbox>
            )}
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("settings.person.moveCardUp", { card: name })}
                disabled={index === 0}
                onClick={() => onMove(card, cards[index - 1]!)}
              >
                <ChevronUpIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("settings.person.moveCardDown", { card: name })}
                disabled={index === cards.length - 1}
                onClick={() => onMove(card, cards[index + 1]!)}
              >
                <ChevronDownIcon className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OverviewSettingsPanel() {
  const { t } = useTranslation();
  const settings = useQuery(overviewSettingsQuery());
  return (
    <SectionCard
      title={t("settings.overview.title")}
      description={t("settings.overview.description")}
    >
      {settings.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{settings.error.message}</p>
      ) : (
        <OverviewSettingsForm initial={settings.data} />
      )}
    </SectionCard>
  );
}

/** Which Overview cards show and in what order, for everyone; members can hide more for themselves. */
function OverviewSettingsForm({ initial }: { initial: OverviewSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateMutation = useMutation({ mutationFn: updateOverviewSettings });

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      const saved = await updateMutation.mutateAsync({ data: value });
      queryClient.setQueryData(overviewSettingsQuery().queryKey, saved);
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
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.overview.cards")}</p>
          <form.Field name="cardOrder">
            {(orderField) => (
              <form.Field name="hiddenCards">
                {(hiddenField) => {
                  // Every card, one added since the order was saved included.
                  const full = [
                    ...new Set([...orderField.state.value, ...overviewCardSchema.options]),
                  ];
                  return (
                    <div className="max-w-md">
                      <OrderedCardList
                        cards={full}
                        hidden={hiddenField.state.value}
                        label={(card) => overviewCardLabel(card, t)}
                        note={(card) =>
                          OVERVIEW_CARD_ROLE[card] === "member"
                            ? null
                            : t(`settings.overview.for.${OVERVIEW_CARD_ROLE[card]}`)
                        }
                        onMove={(card, neighbour) =>
                          orderField.handleChange(swapped(full, card, neighbour))
                        }
                        onHiddenChange={hiddenField.handleChange}
                      />
                    </div>
                  );
                }}
              </form.Field>
            )}
          </form.Field>
          <p className="text-sm text-muted-foreground">{t("settings.overview.cardsHelp")}</p>
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="onThisDayEvents">
          {(field) => (
            <CheckboxListSetting
              label={t("settings.overview.onThisDayEvents")}
              help={t("settings.overview.onThisDayEventsHelp")}
              items={onThisDayEventSchema.options.map((event) => ({
                value: event,
                label: t(`settings.overview.onThisDayEvent.${event}`),
              }))}
              value={field.state.value}
              onChange={(event, on) =>
                // Kept in the options' own order, whatever order they're ticked in.
                field.handleChange(
                  onThisDayEventSchema.options.filter((option) =>
                    option === event ? on : field.state.value.includes(option),
                  ),
                )
              }
            />
          )}
        </form.Field>
        <form.Field name="onThisDayLivingBirthdays">
          {(field) => (
            <Switch
              checked={field.state.value}
              onCheckedChange={field.handleChange}
              description={t("settings.overview.onThisDayLivingBirthdaysHelp")}
            >
              {t("settings.overview.onThisDayLivingBirthdays")}
            </Switch>
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

function PeopleListSettingsPanel() {
  const { t } = useTranslation();
  const settings = useQuery(peopleListSettingsQuery());
  return (
    <SectionCard
      title={t("settings.peopleList.title")}
      description={t("settings.peopleList.description")}
    >
      {settings.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{settings.error.message}</p>
      ) : (
        <PeopleListSettingsForm initial={settings.data} />
      )}
    </SectionCard>
  );
}

/**
 * The People list's defaults, saved together. Defaults only: a member's
 * sort and filters while they work are in the list's URL, and their own
 * table/card choice (saved on their profile) wins over `defaultView`.
 */
function PeopleListSettingsForm({ initial }: { initial: PeopleListSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateMutation = useMutation({ mutationFn: updatePeopleListSettings });

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      const saved = await updateMutation.mutateAsync({ data: value });
      queryClient.setQueryData(peopleListSettingsQuery().queryKey, saved);
      // The list's queries were made for the old defaults.
      await queryClient.invalidateQueries({ queryKey: ["person", "list"] });
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
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.peopleList.defaultSort")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <form.Field name="defaultSort">
              {(field) => (
                <Select
                  aria-label={t("settings.peopleList.defaultSort")}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  options={personListSortSchema.options.map((value) => ({
                    value,
                    label: t(`people.sortBy.${value}`),
                  }))}
                />
              )}
            </form.Field>
            <form.Field name="defaultSortDirection">
              {(field) => (
                <ButtonRadioGroup
                  aria-label={t("settings.peopleList.defaultSortDirection")}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  options={[
                    { value: "asc" as const, label: t("settings.peopleList.ascending") },
                    { value: "desc" as const, label: t("settings.peopleList.descending") },
                  ]}
                />
              )}
            </form.Field>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("settings.peopleList.defaultSortHelp")}
          </p>
        </div>
        <form.Field name="defaultView">
          {(field) => (
            <ChoiceSetting
              label={t("settings.peopleList.defaultView")}
              help={t("settings.peopleList.defaultViewHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "table", label: t("people.viewModeTable") },
                { value: "card", label: t("people.viewModeCard") },
              ]}
            />
          )}
        </form.Field>
        <form.Field name="dateDetail">
          {(field) => (
            <ChoiceSetting
              label={t("settings.peopleList.dateDetail")}
              help={t("settings.peopleList.dateDetailHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "full", label: t("settings.tree.dateDetailFull") },
                { value: "years", label: t("settings.tree.dateDetailYears") },
              ]}
            />
          )}
        </form.Field>
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="defaultRowDetail">
          {(field) => (
            <ChoiceSetting
              label={t("settings.peopleList.defaultRowDetail")}
              help={t("settings.peopleList.defaultRowDetailHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "compact", label: t("settings.peopleList.rowCompact") },
                { value: "detailed", label: t("settings.peopleList.rowDetailed") },
              ]}
            />
          )}
        </form.Field>
        {/* What a two-line row holds — the site's call; each member only
            chooses one line or two. */}
        <p className="text-sm font-medium">{t("settings.peopleList.detailGroup")}</p>
        {(["detailParents", "detailSpouses", "detailPlaces"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
                description={t(`settings.peopleList.${name}Help`)}
              >
                {t(`settings.peopleList.${name}`)}
              </Switch>
            )}
          </form.Field>
        ))}
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="defaultGrouping">
          {(field) => (
            <div className="space-y-2">
              <LabeledField label={t("settings.peopleList.defaultGrouping")}>
                <Select
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  options={peopleListGroupingSchema.options.map((value) => ({
                    value,
                    label: t(`people.groupBy.${value}`),
                  }))}
                />
              </LabeledField>
              <p className="text-sm text-muted-foreground">
                {t("settings.peopleList.defaultGroupingHelp")}
              </p>
            </div>
          )}
        </form.Field>
        <form.Field name="defaultColumns">
          {(field) => (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("settings.peopleList.defaultColumns")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {peopleListColumnSchema.options.map((column) => (
                  <Checkbox
                    key={column}
                    checked={field.state.value.includes(column)}
                    onCheckedChange={(checked) =>
                      field.handleChange(
                        // Kept in the table's own order, whatever order they're ticked in.
                        peopleListColumnSchema.options.filter((option) =>
                          option === column ? checked : field.state.value.includes(option),
                        ),
                      )
                    }
                  >
                    {t(`settings.peopleList.column.${column}`)}
                  </Checkbox>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("settings.peopleList.defaultColumnsHelp")}
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

function RecordSettingsPanel({ options }: { options: ConfigurableOptionRow[] }) {
  const { t } = useTranslation();
  const settings = useRecordSettingsQuery();
  return (
    <SectionCard
      title={t("settings.records.title")}
      description={t("settings.records.description")}
    >
      {settings.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : settings.isError ? (
        <p className="text-sm text-destructive">{settings.error.message}</p>
      ) : (
        <RecordSettingsForm initial={settings.data} options={options} />
      )}
    </SectionCard>
  );
}

/** Toggles `value` in or out of a list, keeping `order`'s order. */
function toggled<T>(list: readonly T[], value: T, on: boolean, order: readonly T[]): T[] {
  const next = new Set(list);
  if (on) next.add(value);
  else next.delete(value);
  return [
    ...order.filter((item) => next.has(item)),
    ...[...next].filter((item) => !order.includes(item)),
  ];
}

/**
 * Same shape as `TreeSettingsForm`. Censuses come from all over the world:
 * the built-in countries can each be offered or not, and anything else — a
 * country with no built-in list, a local count — is a custom census here.
 */
function RecordSettingsForm({
  initial,
  options,
}: {
  initial: RecordSettings;
  options: ConfigurableOptionRow[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateMutation = useMutation({ mutationFn: updateRecordSettings });

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      const saved = await updateMutation.mutateAsync({ data: value });
      queryClient.setQueryData(recordSettingsQueryKey, saved);
      form.reset(saved);
    },
  });
  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const countryLabel = (country: string) =>
    t(`records.country.${country}`, { defaultValue: country });

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SettingsGroup>
        <form.Field name="enabledRecordTypes">
          {(field) => (
            <CheckboxListSetting
              label={t("settings.records.enabledRecordTypes")}
              help={t("settings.records.enabledRecordTypesHelp")}
              items={recordTypeSchema.options.map((type) => ({
                value: type,
                label: t(`records.type.${type}`),
              }))}
              value={field.state.value}
              onChange={(type, on) =>
                field.handleChange(toggled(field.state.value, type, on, recordTypeSchema.options))
              }
            />
          )}
        </form.Field>
      </SettingsGroup>

      <form.Subscribe selector={(state) => state.values.customCensuses}>
        {(customCensuses) => {
          // Every country there's a census for: the built-in ones, then any
          // a custom census adds.
          const builtIn: readonly string[] = BUILT_IN_CENSUS_COUNTRIES;
          const countries = [
            ...builtIn,
            ...new Set(
              customCensuses
                .map((census) => census.country)
                .filter((country) => !builtIn.includes(country)),
            ),
          ];
          const items = countries.map((country) => ({
            value: country,
            label: `${countryLabel(country)} (${allCensuses(customCensuses).filter((census) => census.country === country).length})`,
          }));
          return (
            <SettingsGroup>
              <form.Field name="censusCountries">
                {(field) => (
                  <CheckboxListSetting
                    label={t("settings.records.censusCountries")}
                    help={t("settings.records.censusCountriesHelp")}
                    items={items}
                    value={field.state.value}
                    onChange={(country, on) =>
                      field.handleChange(toggled(field.state.value, country, on, countries))
                    }
                  />
                )}
              </form.Field>
              <form.Field name="coverageCountries">
                {(field) => (
                  <CheckboxListSetting
                    label={t("settings.records.coverageCountries")}
                    help={t("settings.records.coverageCountriesHelp")}
                    items={items.map((item) => ({ ...item, label: countryLabel(item.value) }))}
                    value={field.state.value}
                    onChange={(country, on) =>
                      field.handleChange(toggled(field.state.value, country, on, countries))
                    }
                  />
                )}
              </form.Field>
            </SettingsGroup>
          );
        }}
      </form.Subscribe>

      <SettingsGroup>
        <form.Field name="customCensuses">
          {(field) => (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("settings.records.customCensuses")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("settings.records.customCensusesHelp")}
                </p>
              </div>
              {field.state.value.length > 0 && (
                <ul className="divide-y rounded-md border">
                  {field.state.value.map((census) => (
                    <li
                      key={census.key}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium">
                          {census.label ||
                            t("records.censusLabel", {
                              country: countryLabel(census.country),
                              year: census.year,
                            })}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {[
                            census.date,
                            census.hasRelationship && t("settings.records.hasRelationship"),
                            census.hasBirthplace && t("settings.records.hasBirthplace"),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <RemoveButton
                        itemLabel={census.label || `${countryLabel(census.country)} ${census.year}`}
                        onConfirm={() =>
                          field.handleChange(
                            field.state.value.filter((item) => item.key !== census.key),
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              <AddCensusForm
                existingKeys={allCensuses(field.state.value).map((census) => census.key)}
                onAdd={(census) => field.handleChange([...field.state.value, census])}
              />
            </div>
          )}
        </form.Field>
      </SettingsGroup>

      <SettingsGroup>
        <form.Field name="citationConfidence">
          {(field) => (
            <div className="space-y-2">
              <LabeledField label={t("settings.records.citationConfidence")}>
                <Select
                  aria-label={t("settings.records.citationConfidence")}
                  value={field.state.value}
                  onValueChange={(value) => {
                    if (typeof value === "string") field.handleChange(value);
                  }}
                  className="w-56"
                  options={optionsFor(options, "confidence").map((option) => ({
                    value: option.key,
                    label: option.label,
                  }))}
                />
              </LabeledField>
              <p className="text-sm text-muted-foreground">
                {t("settings.records.citationConfidenceHelp")}
              </p>
            </div>
          )}
        </form.Field>
        <form.Field name="relationshipLinks">
          {(field) => (
            <ChoiceSetting
              label={t("settings.records.relationshipLinks")}
              help={t("settings.records.relationshipLinksHelp")}
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "suggest", label: t("settings.records.relationshipLinksSuggest") },
                { value: "automatic", label: t("settings.records.relationshipLinksAutomatic") },
              ]}
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

function CheckboxListSetting<T extends string>({
  label,
  help,
  items,
  value,
  onChange,
}: {
  label: string;
  help: string;
  items: Array<{ value: T; label: string }>;
  value: readonly T[];
  onChange: (item: T, on: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map((item) => (
          <Checkbox
            key={item.value}
            checked={value.includes(item.value)}
            onCheckedChange={(on) => onChange(item.value, on)}
          >
            {item.label}
          </Checkbox>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{help}</p>
    </fieldset>
  );
}

/**
 * A custom census's own little form, inside the Records form: it adds to
 * the list there, saved along with everything else by the section's Save.
 * The key is derived (`country-year`, plus a suffix if that's taken) so two
 * counts in one year can coexist.
 */
function AddCensusForm({
  existingKeys,
  onAdd,
}: {
  existingKeys: readonly string[];
  onAdd: (census: CensusDefinition) => void;
}) {
  const { t } = useTranslation();
  const [country, setCountry] = useState("");
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [hasRelationship, setHasRelationship] = useState(true);
  const [hasBirthplace, setHasBirthplace] = useState(true);

  const slug = country
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  const year = Number(date.slice(0, 4));
  let key = `${slug}-${year}`;
  for (let n = 2; existingKeys.includes(key); n++) key = `${slug}-${year}-${n}`;
  const parsed = censusDefinitionSchema.safeParse({
    key,
    country: slug,
    year,
    date,
    hasBirthplace,
    hasRelationship,
    ...(label.trim() ? { label: label.trim() } : {}),
  });

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <LabeledField label={t("settings.records.customCountry")}>
          <Input
            value={country}
            placeholder="fi"
            onChange={(event) => setCountry(event.target.value)}
          />
        </LabeledField>
        <LabeledField label={t("settings.records.customDate")}>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </LabeledField>
        <LabeledField label={t("settings.records.customLabel")}>
          <Input
            value={label}
            placeholder={t("settings.records.customLabelPlaceholder")}
            onChange={(event) => setLabel(event.target.value)}
          />
        </LabeledField>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Checkbox checked={hasRelationship} onCheckedChange={setHasRelationship}>
          {t("settings.records.hasRelationship")}
        </Checkbox>
        <Checkbox checked={hasBirthplace} onCheckedChange={setHasBirthplace}>
          {t("settings.records.hasBirthplace")}
        </Checkbox>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!parsed.success}
          onClick={() => {
            if (!parsed.success) return;
            onAdd(parsed.data);
            setCountry("");
            setDate("");
            setLabel("");
          }}
        >
          {t("settings.records.addCensus")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.records.customCountryHelp")}</p>
    </div>
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
        {(
          [
            "showPhotos",
            "showGenderBadge",
            "showMourningBand",
            "showRelationshipLabels",
            "showMarriageYear",
          ] as const
        ).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
                description={t(`settings.tree.${name}Help`)}
              >
                {t(`settings.tree.${name}`)}
              </Switch>
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
            <Switch
              checked={field.state.value}
              onCheckedChange={field.handleChange}
              description={t("settings.tree.highlightDirectLineHelp")}
            >
              {t("settings.tree.highlightDirectLine")}
            </Switch>
          )}
        </form.Field>
      </SettingsGroup>

      <SettingsGroup>
        {(["showMinimap", "animateTransitions", "rememberLastView"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Switch
                checked={field.state.value}
                onCheckedChange={field.handleChange}
                description={t(`settings.tree.${name}Help`)}
              >
                {t(`settings.tree.${name}`)}
              </Switch>
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
      <ButtonRadioGroup
        aria-label={label}
        value={value}
        onValueChange={onChange}
        options={options}
      />
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
            disabled={isFirst}
            onClick={() => void move("up")}
          >
            <ChevronUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("settings.moveDown")}
            disabled={isLast}
            onClick={() => void move("down")}
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
      {/* Rendered here rather than inside the confirm dialog: confirming
          closes it whether or not `remove()` throws, so an error shown inside
          it would flash and vanish before it could be read. */}
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
