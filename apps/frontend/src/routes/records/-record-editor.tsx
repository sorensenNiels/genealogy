import {
  ageMismatch,
  allCensuses,
  censusDayDate,
  estimatedBirthFromAge,
  findCensus,
  formatLifespan,
  joinHistoricalDateText,
  parseHistoricalDate,
  RECORD_TEMPLATES,
  splitHistoricalDateText,
  type CensusDefinition,
  type HistoricalDate,
  type RecordColumn,
  type RecordInput,
  type RecordType,
  type RelationshipCandidate,
} from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { Dialog } from "@genealogy/ui/components/dialog";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Select } from "@genealogy/ui/components/select";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage, type SupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate, historicalDateFieldPreview } from "../../lib/format-date";
import { usePermissions } from "../../lib/permissions";
import { optionsFor } from "../../lib/person-display";
import { usePersonName } from "../../lib/person-name";
import { useRecordSettings } from "../../lib/record-settings";
import { createPerson, listPersons } from "../../server/functions/person.functions";
import {
  applyRecordSuggestion,
  removeRecord,
  saveRecord,
} from "../../server/functions/records.functions";
import { listOptions } from "../../server/functions/settings.functions";
import { createSource, listSources } from "../../server/functions/source.functions";

type DateParts = ReturnType<typeof splitHistoricalDateText>;

/** A row in the editor: what's saved, plus the linked person's name for display and a stable key for React. */
export interface EditorRow {
  key: string;
  id?: string;
  role: string;
  name: string;
  sex: "M" | "F" | "U";
  age: string;
  maritalStatus: string;
  occupation: string;
  residence: string;
  birthplace: string;
  person: { id: string; given: string; surname: string } | null;
}

/** Everything the editor edits — `RecordInput`, with the date as editable parts. */
export interface EditorState {
  id?: string;
  recordType: RecordType;
  censusKey: string | null;
  date: DateParts;
  place: string;
  address: string;
  reference: string;
  sourceId: string | null;
  page: string;
  url: string;
  notes: string;
  people: EditorRow[];
}

let nextKey = 0;
/** A client-only key for a row, so React keeps its inputs when rows move. */
export function newRowKey(): string {
  nextKey += 1;
  return `row-${nextKey}`;
}

export function emptyRow(role = ""): EditorRow {
  return {
    key: newRowKey(),
    role,
    name: "",
    sex: "U",
    age: "",
    maritalStatus: "",
    occupation: "",
    residence: "",
    birthplace: "",
    person: null,
  };
}

/** A census's day as editable date parts. */
export function censusDateParts(
  census: CensusDefinition | null,
  language: SupportedLanguage,
): DateParts {
  return splitHistoricalDateText(census ? censusDayDate(census, language).original : "", language);
}

/** "Denmark 1845", or a custom census's own label. */
export function censusLabel(t: TFunction, census: CensusDefinition): string {
  return (
    census.label ??
    t("records.censusLabel", {
      country: t(`records.country.${census.country}`, { defaultValue: census.country }),
      year: census.year,
    })
  );
}

/** "Census: Denmark 1845", "Baptism", ... — a record's name in lists and titles. */
export function recordTitle(
  t: TFunction,
  record: { recordType: string; censusKey: string | null },
  customCensuses: readonly CensusDefinition[],
): string {
  const census =
    record.recordType === "census" ? findCensus(record.censusKey, customCensuses) : null;
  return census ? censusLabel(t, census) : t(`records.type.${record.recordType}`);
}

function toHistoricalDate(parts: DateParts, language: SupportedLanguage): HistoricalDate | null {
  const original = joinHistoricalDateText(parts, language);
  return original === null ? null : { original, ...parseHistoricalDate(original, language) };
}

/**
 * The record editor — any record type, entered as written, with each row
 * linked to a person in the tree (or not). What a type looks like comes
 * from its template (`RECORD_TEMPLATES`) and, for a census, the census
 * definition (which columns were asked). Saving hands the whole record to
 * `records.save`, which keeps the events, unions, roles and citations it
 * implies in step. Used by `/records/new` and `/records/$recordId`.
 */
const NO_SUGGESTIONS: RelationshipCandidate[] = [];

export function RecordEditor({
  initial,
  suggestions = NO_SUGGESTIONS,
}: {
  initial: EditorState;
  /** For a saved record: the family links it implies that the tree lacks. */
  suggestions?: RelationshipCandidate[];
}) {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const { canEdit } = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useRecordSettings();
  const [state, setState] = useState(initial);
  // The saved state to compare against for the Save button's dirty dot. A
  // snapshot in state, not a ref: it's read during render.
  const [saved, setSaved] = useState(initial);
  const [linking, setLinking] = useState<string | null>(null);
  const isDirty = JSON.stringify(state) !== JSON.stringify(saved);

  const sources = useQuery({ queryKey: ["source", "listSources"], queryFn: () => listSources() });
  const options = useQuery({ queryKey: ["settings", "listOptions"], queryFn: () => listOptions() });
  const template = RECORD_TEMPLATES[state.recordType];
  const isCensus = state.recordType === "census";
  const census = isCensus ? findCensus(state.censusKey, settings.customCensuses) : null;
  const censusChoices = allCensuses(settings.customCensuses).filter(
    (definition) =>
      settings.censusCountries.includes(definition.country) || definition.key === state.censusKey,
  );
  const columns = template.columns.filter(
    (column) =>
      !(column === "birthplace" && census && !census.hasBirthplace) &&
      !(column === "role" && census && !census.hasRelationship),
  );
  const roleOptions: { key: string; label: string }[] = isCensus
    ? optionsFor(options.data ?? [], "household_position")
    : template.roles.map((role) => ({
        key: role,
        label: t(`records.role.${state.recordType}.${role}`),
      }));
  const date = toHistoricalDate(state.date, language);
  const dayIso = date?.earliest ?? date?.latest ?? census?.date ?? null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input: RecordInput = {
        ...(state.id ? { id: state.id } : {}),
        recordType: state.recordType,
        censusKey: isCensus ? state.censusKey : null,
        date,
        place: state.place,
        address: state.address,
        reference: state.reference,
        sourceId: state.sourceId,
        page: state.page,
        url: state.url,
        notes: state.notes,
        people: state.people.map((row) => ({
          ...(row.id ? { id: row.id } : {}),
          role: row.role,
          name: row.name,
          sex: row.sex,
          age: row.age,
          maritalStatus: row.maritalStatus,
          occupation: row.occupation,
          residence: row.residence,
          birthplace: row.birthplace,
          personId: row.person?.id ?? null,
        })),
      };
      return saveRecord({ data: input });
    },
    onSuccess: async ({ id }) => {
      // Linked people got events, unions and roles; their pages and the tree should show them.
      await queryClient.invalidateQueries({ queryKey: ["records"] });
      await queryClient.invalidateQueries({ queryKey: ["person"] });
      if (!state.id) {
        void navigate({ to: "/records/$recordId", params: { recordId: id }, replace: true });
        return;
      }
      setSaved(state);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeRecord({ data: { id: state.id! } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["records"] });
      await queryClient.invalidateQueries({ queryKey: ["person"] });
      const firstLinked = state.people.find((row) => row.person)?.person;
      void navigate(
        firstLinked
          ? { to: "/people/$personId", params: { personId: firstLinked.id } }
          : { to: "/people" },
      );
    },
  });

  const update = (patch: Partial<EditorState>) =>
    setState((previous) => ({ ...previous, ...patch }));
  const updateRow = (key: string, patch: Partial<EditorRow>) =>
    setState((previous) => ({
      ...previous,
      people: previous.people.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  const moveRow = (index: number, by: -1 | 1) =>
    setState((previous) => {
      const people = [...previous.people];
      const [moved] = people.splice(index, 1);
      people.splice(index + by, 0, moved!);
      return { ...previous, people };
    });
  const linkingRow = state.people.find((row) => row.key === linking) ?? null;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        saveMutation.mutate();
      }}
    >
      {canEdit && suggestions.length > 0 && !isDirty && (
        <Suggestions
          recordType={state.recordType}
          suggestions={suggestions}
          people={state.people}
        />
      )}

      <SectionCard title={t(`records.type.${state.recordType}`)}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isCensus ? (
            <LabeledField label={t("records.editor.census")}>
              <Select
                aria-label={t("records.editor.census")}
                value={state.censusKey ?? ""}
                onValueChange={(value) => {
                  const chosen = findCensus(String(value), settings.customCensuses);
                  if (!chosen) return;
                  update({ censusKey: chosen.key, date: censusDateParts(chosen, language) });
                }}
                options={censusChoices.map((definition) => ({
                  value: definition.key,
                  label: censusLabel(t, definition),
                }))}
              />
            </LabeledField>
          ) : null}
          <LabeledField label={isCensus ? t("records.editor.censusDay") : t("records.editor.date")}>
            <HistoricalDateInput
              quality={state.date.quality}
              onQualityChange={(quality) => update({ date: { ...state.date, quality } })}
              value={state.date.value}
              onChange={(value) => update({ date: { ...state.date, value } })}
              endValue={state.date.endValue}
              onEndChange={(endValue) => update({ date: { ...state.date, endValue } })}
              preview={historicalDateFieldPreview(
                state.date.quality,
                state.date.value,
                state.date.endValue,
                language,
              )}
            />
          </LabeledField>
          <LabeledField label={t("records.editor.place")}>
            <Input
              placeholder={t("records.editor.placePlaceholder")}
              value={state.place}
              onChange={(event) => update({ place: event.target.value })}
            />
          </LabeledField>
          <LabeledField label={t(`records.address.${template.addressKind}`)}>
            <Input
              value={state.address}
              onChange={(event) => update({ address: event.target.value })}
            />
          </LabeledField>
          <LabeledField label={t(`records.reference.${template.referenceKind}`)}>
            <Input
              value={state.reference}
              onChange={(event) => update({ reference: event.target.value })}
            />
          </LabeledField>
        </div>
      </SectionCard>

      <SectionCard
        title={t("records.editor.sourceTitle")}
        description={t("records.editor.sourceHelp")}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SourcePicker
            sourceId={state.sourceId}
            sources={sources.data ?? []}
            defaultTitle={census ? censusLabel(t, census) : t(`records.type.${state.recordType}`)}
            onChange={(sourceId) => update({ sourceId })}
            onCreated={async () => {
              await queryClient.invalidateQueries({ queryKey: ["source", "listSources"] });
            }}
          />
          <LabeledField label={t("records.editor.page")}>
            <Input value={state.page} onChange={(event) => update({ page: event.target.value })} />
          </LabeledField>
          <LabeledField label={t("records.editor.url")}>
            <Input
              type="url"
              placeholder="https://"
              value={state.url}
              onChange={(event) => update({ url: event.target.value })}
            />
          </LabeledField>
        </div>
      </SectionCard>

      <SectionCard
        title={t("records.editor.peopleTitle")}
        description={t(`records.peopleHelp.${state.recordType}`)}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {columns.map((column) => (
                  <th
                    key={column}
                    className={cn(
                      "py-2 pr-2 font-medium",
                      (column === "sex" || column === "age") && "w-20",
                    )}
                  >
                    {column === "role" && isCensus
                      ? t("records.column.position")
                      : t(`records.column.${column}`)}
                  </th>
                ))}
                <th className="py-2 pr-2 font-medium">{t("records.column.person")}</th>
                <th className="w-24 py-2" aria-label={t("records.column.actions")} />
              </tr>
            </thead>
            <tbody>
              {state.people.map((row, index) => (
                <tr key={row.key} className="border-b align-top last:border-b-0">
                  {columns.map((column) => (
                    <td key={column} className="py-1.5 pr-2">
                      <RowCell
                        column={column}
                        row={row}
                        roleOptions={roleOptions}
                        roleLabel={
                          column === "role" && isCensus
                            ? t("records.column.position")
                            : t(`records.column.${column}`)
                        }
                        onChange={(patch) => updateRow(row.key, patch)}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pr-2">
                    {row.person ? (
                      <div className="flex h-8 items-center gap-1">
                        <Link
                          to="/people/$personId"
                          params={{ personId: row.person.id }}
                          className="truncate font-medium hover:underline"
                        >
                          {formatName(row.person)}
                        </Link>
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0"
                            aria-label={t("records.unlink", { name: formatName(row.person) })}
                            onClick={() => updateRow(row.key, { person: null })}
                          >
                            <XIcon className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ) : canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setLinking(row.key)}
                      >
                        {t("records.link")}
                      </Button>
                    ) : (
                      <span className="flex h-8 items-center text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {canEdit && (
                      <div className="flex h-8 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t("records.moveUp")}
                          disabled={index === 0}
                          onClick={() => moveRow(index, -1)}
                        >
                          <ArrowUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t("records.moveDown")}
                          disabled={index === state.people.length - 1}
                          onClick={() => moveRow(index, 1)}
                        >
                          <ArrowDownIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t("records.removeRow")}
                          onClick={() =>
                            update({
                              people: state.people.filter((other) => other.key !== row.key),
                            })
                          }
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => update({ people: [...state.people, emptyRow()] })}
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            {t("records.addRow")}
          </Button>
        )}
      </SectionCard>

      <SectionCard title={t("common.notes")}>
        <MarkdownEditor
          aria-label={t("common.notes")}
          placeholder={t("common.notes")}
          value={state.notes}
          onChange={(notes) => update({ notes })}
        />
      </SectionCard>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {state.id && (
            <RemoveButton
              itemLabel={t("records.thisRecord")}
              description={t("records.removeDescription")}
              onConfirm={() => removeMutation.mutate()}
            />
          )}
          {(saveMutation.isError || removeMutation.isError) && (
            <p className="text-sm text-destructive">
              {(saveMutation.error ?? removeMutation.error)?.message}
            </p>
          )}
          <SaveButton isDirty={isDirty} isPending={saveMutation.isPending}>
            {t("common.save")}
          </SaveButton>
        </div>
      )}

      {linkingRow && (
        <LinkPersonDialog
          row={linkingRow}
          dayIso={dayIso}
          language={language}
          onClose={() => setLinking(null)}
          onLink={(person) => {
            updateRow(linkingRow.key, { person });
            setLinking(null);
          }}
        />
      )}
    </form>
  );
}

/** One cell of a row, by column: a role select, a sex select, or a text input. */
function RowCell({
  column,
  row,
  roleOptions,
  roleLabel,
  onChange,
}: {
  column: RecordColumn;
  row: EditorRow;
  roleOptions: { key: string; label: string }[];
  roleLabel: string;
  onChange: (patch: Partial<EditorRow>) => void;
}) {
  const { t } = useTranslation();
  if (column === "role") {
    return (
      <Select
        aria-label={roleLabel}
        value={row.role === "" ? "none" : row.role}
        onValueChange={(value) =>
          onChange({ role: value === "none" || value === null ? "" : String(value) })
        }
        className="h-8"
        options={[
          { value: "none", label: "—" },
          ...roleOptions.map((option) => ({ value: option.key, label: option.label })),
        ]}
      />
    );
  }
  if (column === "sex") {
    return (
      <Select
        aria-label={t("records.column.sex")}
        value={row.sex}
        onValueChange={(value) => {
          if (value === "M" || value === "F" || value === "U") onChange({ sex: value });
        }}
        className="h-8"
        options={[
          { value: "M", label: t("records.sex.M") },
          { value: "F", label: t("records.sex.F") },
          { value: "U", label: t("records.sex.U") },
        ]}
      />
    );
  }
  return (
    <Input
      aria-label={t(`records.column.${column}`)}
      className="h-8"
      value={row[column]}
      onChange={(event) => onChange({ [column]: event.target.value })}
    />
  );
}

/**
 * The family links this record implies that the tree doesn't have yet —
 * each one click to make. Shown only for a saved record with no unsaved
 * changes, since the suggestions are worked out from what's saved.
 */
function Suggestions({
  recordType,
  suggestions,
  people,
}: {
  recordType: RecordType;
  suggestions: RelationshipCandidate[];
  people: EditorRow[];
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const queryClient = useQueryClient();
  const apply = useMutation({
    mutationFn: (link: RelationshipCandidate) =>
      applyRecordSuggestion({ data: { recordType, link } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["records"] });
      await queryClient.invalidateQueries({ queryKey: ["person"] });
    },
  });
  const nameOf = (id: string) => {
    const person = people.find((row) => row.person?.id === id)?.person;
    return person ? formatName(person) : "?";
  };

  return (
    <SectionCard title={t("records.suggestions.title")} description={t("records.suggestions.help")}>
      <ul className="space-y-2">
        {suggestions.map((link) => {
          const text =
            link.kind === "parent"
              ? t("records.suggestions.parent", {
                  parent: nameOf(link.parentId),
                  child: nameOf(link.childId),
                })
              : t("records.suggestions.spouse", { a: nameOf(link.aId), b: nameOf(link.bId) });
          return (
            <li
              key={
                link.kind === "parent"
                  ? `${link.parentId}>${link.childId}`
                  : `${link.aId}=${link.bId}`
              }
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>{text}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={apply.isPending}
                onClick={() => apply.mutate(link)}
              >
                {t("records.suggestions.link")}
              </Button>
            </li>
          );
        })}
      </ul>
      {apply.isError && <p className="mt-2 text-sm text-destructive">{apply.error.message}</p>}
    </SectionCard>
  );
}

/** The record's source: pick an existing one, or create one on the spot (named after the record). */
function SourcePicker({
  sourceId,
  sources,
  defaultTitle,
  onChange,
  onCreated,
}: {
  sourceId: string | null;
  sources: { id: string; title: string }[];
  defaultTitle: string;
  onChange: (sourceId: string | null) => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const createMutation = useMutation({
    mutationFn: () => createSource({ data: { title: title.trim() } }),
    onSuccess: async (source) => {
      await onCreated();
      onChange(source.id);
      setCreating(false);
    },
  });

  if (creating) {
    return (
      <LabeledField label={t("records.editor.newSource")}>
        <div className="flex gap-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={title.trim() === "" || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {t("common.add")}
          </Button>
        </div>
      </LabeledField>
    );
  }
  return (
    <LabeledField label={t("records.editor.source")}>
      <div className="flex gap-2">
        <Select
          aria-label={t("records.editor.source")}
          value={sourceId ?? "none"}
          onValueChange={(value) =>
            onChange(value === "none" || value === null ? null : String(value))
          }
          options={[
            { value: "none", label: t("records.editor.noSource") },
            ...sources.map((source) => ({ value: source.id, label: source.title })),
          ]}
        />
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => {
              setTitle(defaultTitle);
              setCreating(true);
            }}
          >
            {t("records.editor.newSourceButton")}
          </Button>
        )}
      </div>
    </LabeledField>
  );
}

/** Splits a name as written into given names and surname: the last word is the surname. */
function splitName(name: string): { given: string; surname: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { given: words[0] ?? "", surname: "" };
  return { given: words.slice(0, -1).join(" "), surname: words.at(-1)! };
}

/**
 * Link a row to someone in the tree: people matching the row's name, each
 * marked with whether their recorded birth fits the age in the record
 * (`ageMismatch`), or a new person made from the row — with the birth
 * estimated from the age and the birthplace as written.
 */
function LinkPersonDialog({
  row,
  dayIso,
  language,
  onClose,
  onLink,
}: {
  row: EditorRow;
  dayIso: string | null;
  language: SupportedLanguage;
  onClose: () => void;
  onLink: (person: { id: string; given: string; surname: string }) => void;
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const [query, setQuery] = useState(row.name);
  const trimmed = query.trim();
  const searchInput = { limit: 12, offset: 0, search: trimmed === "" ? null : trimmed };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
  });
  const estimatedBirth = dayIso ? estimatedBirthFromAge(row.age, dayIso, language) : null;
  const createMutation = useMutation({
    mutationFn: () =>
      createPerson({
        data: {
          ...splitName(row.name),
          gender: row.sex,
          birth: estimatedBirth,
          birthPlace: row.birthplace.trim() === "" ? null : row.birthplace,
        },
      }),
    onSuccess: (created) => onLink(created),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("records.linkTitle", { name: row.name || "—" })}
    >
      <div className="space-y-3">
        <Input
          aria-label={t("person.family.searchPeople")}
          placeholder={t("person.family.searchPeople")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {(search.data?.items ?? []).map((candidate) => {
            const yearsOff = dayIso ? ageMismatch(candidate.birth, row.age, dayIso) : null;
            const hasAge = dayIso !== null && row.age.trim() !== "" && candidate.birth !== null;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => onLink(candidate)}
                >
                  <span className="min-w-0 truncate">
                    {formatName(candidate)}
                    {formatLifespan(candidate) ? (
                      <span className="text-muted-foreground"> ({formatLifespan(candidate)})</span>
                    ) : null}
                  </span>
                  {hasAge &&
                    (yearsOff === null ? (
                      <Badge className="shrink-0 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        {t("records.ageFits")}
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        {t("records.ageOff", { years: Math.abs(yearsOff) })}
                      </Badge>
                    ))}
                </button>
              </li>
            );
          })}
          {search.data && search.data.items.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {t("person.family.noMatches")}
            </li>
          )}
        </ul>
        <div className="border-t pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={row.name.trim() === "" || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            {t("records.createFromRow")}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {estimatedBirth
              ? t("records.createHintWithBirth", {
                  birth: formatDisplayDate(estimatedBirth, language),
                })
              : t("records.createHint")}
          </p>
          {createMutation.isError && (
            <p className="mt-2 text-sm text-destructive">{createMutation.error.message}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
