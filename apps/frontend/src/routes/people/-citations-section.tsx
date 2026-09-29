import { confidenceSchema, type CitationFactType, type Confidence } from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
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
import { Tooltip, TooltipContent } from "@genealogy/ui/components/tooltip";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { labelFor, optionsFor } from "../../lib/person-display";
import { addCitation, createSource, removeCitation } from "../../server/functions/source.functions";
import type {
  CitationRow,
  ConfigurableOptionRow,
  NameVariantRow,
  PersonEventRow,
  SourceRow,
  UnionRow,
} from "./-types";

export type FactOption = {
  key: string;
  factType: CitationFactType;
  factId: string | null;
  label: string;
};

export function CitationsSection({
  personId,
  citations,
  sourcesList,
  names,
  events,
  unions,
  options,
  onChanged,
}: {
  personId: string;
  citations: CitationRow[];
  sourcesList: SourceRow[];
  names: NameVariantRow[];
  events: PersonEventRow[];
  unions: UnionRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const removeCitationMutation = useMutation({ mutationFn: removeCitation });

  const remove = async (id: string) => {
    await removeCitationMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  const sourceById = new Map(sourcesList.map((source) => [source.id, source]));

  const factLabel = (citation: CitationRow): string => {
    switch (citation.factType) {
      case "person":
        return t("person.citations.thisPerson");
      case "name": {
        const name = names.find((candidate) => candidate.id === citation.factId);
        return name
          ? t("person.citations.alternateNameWithValue", {
              name: [name.given, name.surname].filter(Boolean).join(" "),
            })
          : t("person.citations.alternateName");
      }
      case "event": {
        const event = events.find((candidate) => candidate.id === citation.factId);
        return event
          ? `${t("person.events.eventFixedFactLabel", { type: labelFor(options, "event_type", event.eventType) })}${event.label ? ` (${event.label})` : ""}`
          : t("person.citations.eventFallback");
      }
      case "union": {
        const union = unions.find((candidate) => candidate.id === citation.factId);
        return union
          ? t("person.citations.unionWithStatus", {
              status: labelFor(options, "union_status", union.status),
            })
          : t("person.citations.unionFallback");
      }
    }
  };

  return (
    <SectionCard
      title={t("person.citations.title")}
      titleClassName="text-base"
      contentClassName="space-y-2"
      action={
        <FormDialog
          trigger={
            <Tooltip>
              <Button variant="outline" size="icon" aria-label={t("person.events.addCitation")}>
                <PlusIcon className="size-4" />
              </Button>
              <TooltipContent>{t("person.events.addCitation")}</TooltipContent>
            </Tooltip>
          }
          title={t("person.events.addCitation")}
        >
          {(close) => (
            <CitationForm
              personId={personId}
              sourcesList={sourcesList}
              names={names}
              events={events}
              unions={unions}
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
      {citations.map((citation) => {
        const source = sourceById.get(citation.sourceId);
        return (
          <div key={citation.id} className="flex items-center justify-between gap-2 text-sm">
            <div>
              <Badge variant="outline" className="mr-2">
                {labelFor(options, "confidence", citation.confidence)}
              </Badge>
              <span className="font-medium">
                {source?.title ?? t("person.events.unknownSource")}
              </span>
              <p className="text-xs text-muted-foreground">
                {factLabel(citation)}
                {citation.page ? ` · ${t("person.events.page", { page: citation.page })}` : ""}
                {citation.note ? ` · ${citation.note}` : ""}
              </p>
            </div>
            <RemoveButton
              itemLabel={t("person.events.thisCitationOf", {
                title: source?.title ?? t("person.events.unknownSource"),
              })}
              onConfirm={() => void remove(citation.id)}
            />
          </div>
        );
      })}
    </SectionCard>
  );
}

// Stable reference for the "names"/"events"/"unions" defaults below — an
// inline `[]` would be a fresh array every render, which oxlint's
// `no-object-type-as-default-prop` flags (a new default defeats memoization
// downstream, though nothing here currently memoizes on it).
const EMPTY_FACT_ROWS: never[] = [];

export function CitationForm({
  personId,
  sourcesList,
  names = EMPTY_FACT_ROWS,
  events = EMPTY_FACT_ROWS,
  unions = EMPTY_FACT_ROWS,
  options,
  fixedFact,
  embedded = false,
  onDone,
}: {
  personId: string;
  sourcesList: SourceRow[];
  names?: NameVariantRow[];
  events?: PersonEventRow[];
  unions?: UnionRow[];
  options: ConfigurableOptionRow[];
  /**
   * Pins "what this cites" to a specific fact and hides the picker — used
   * when this form is opened from inside that fact's own edit dialog (e.g.
   * `EventCitations`), where offering the full person/name/event/union list
   * would be both redundant and let the citation drift onto the wrong fact.
   */
  fixedFact?: FactOption;
  /**
   * Renders as a plain `<div>` with the Save button driving `submit()`
   * directly via `onPress`, instead of a `<form>` relying on native submit —
   * for use inside another dialog's own `<form>` (e.g. `EventCitations`),
   * where a nested `<form>` would be invalid HTML. Also sidesteps a real bug
   * found while building that: stacking this component's own `Dialog`
   * inside another one closes *both* on submit (traced via MutationObserver
   * to a single synchronous DOM removal covering both `ModalOverlay`s —
   * React Aria Components doesn't cleanly support nested `Modal`s here),
   * so the embedded case doesn't open its own nested dialog at all; the
   * caller (`EventCitations`) swaps this form in as inline content instead.
   */
  embedded?: boolean;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const createSourceMutation = useMutation({ mutationFn: createSource });
  const addCitationMutation = useMutation({ mutationFn: addCitation });

  const factOptions: FactOption[] = fixedFact
    ? [fixedFact]
    : [
        {
          key: "person|none",
          factType: "person",
          factId: null,
          label: t("person.citations.thisPersonGeneral"),
        },
        // No separate "birth"/"death" entries — those are `person_events` rows
        // now (see PersonService), so they fall out of the `events.map` below
        // like any other event ("Event: Birth").
        ...names.map((name) => ({
          key: `name|${name.id}`,
          factType: "name" as const,
          factId: name.id,
          label: t("person.citations.nameLabel", {
            name:
              [name.given, name.surname].filter(Boolean).join(" ") ||
              t("person.citations.nameUnnamed"),
          }),
        })),
        ...events.map((event) => ({
          key: `event|${event.id}`,
          factType: "event" as const,
          factId: event.id,
          label: `${t("person.events.eventFixedFactLabel", { type: labelFor(options, "event_type", event.eventType) })}${event.label ? ` (${event.label})` : ""}`,
        })),
        ...unions.map((union) => ({
          key: `union|${union.id}`,
          factType: "union" as const,
          factId: union.id,
          label: t("person.citations.unionWithStatus", {
            status: labelFor(options, "union_status", union.status),
          }),
        })),
      ];

  const [factKey, setFactKey] = useState(factOptions[0]!.key);
  const [sourceMode, setSourceMode] = useState<"existing" | "new">(
    sourcesList.length > 0 ? "existing" : "new",
  );
  const [sourceId, setSourceId] = useState(sourcesList[0]?.id ?? "");
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceAuthor, setNewSourceAuthor] = useState("");
  const [confidence, setConfidence] = useState<Confidence>("medium");
  const [page, setPage] = useState("");
  const [note, setNote] = useState("");

  const selectedFact = factOptions.find((option) => option.key === factKey) ?? factOptions[0]!;
  const pending = createSourceMutation.isPending || addCitationMutation.isPending;
  const canSubmit = sourceMode === "existing" ? sourceId !== "" : newSourceTitle.trim() !== "";

  // This form has no TanStack Form to track dirtiness for it — it's always a
  // fresh "add" with no saved record to diff against, so every field is
  // plain useState. Snapshot each one's starting value once via a lazy
  // initializer (the dialog unmounts this component on close, so this only
  // ever captures a fresh mount) and compare against it directly.
  const [initial] = useState({
    factKey,
    sourceMode,
    sourceId,
    newSourceTitle,
    newSourceAuthor,
    confidence,
    page,
    note,
  });
  const isDirty =
    factKey !== initial.factKey ||
    sourceMode !== initial.sourceMode ||
    sourceId !== initial.sourceId ||
    newSourceTitle !== initial.newSourceTitle ||
    newSourceAuthor !== initial.newSourceAuthor ||
    confidence !== initial.confidence ||
    page !== initial.page ||
    note !== initial.note;

  const submit = async () => {
    const resolvedSourceId =
      sourceMode === "existing"
        ? sourceId
        : (
            await createSourceMutation.mutateAsync({
              data: {
                title: newSourceTitle.trim(),
                author: newSourceAuthor.trim() === "" ? null : newSourceAuthor.trim(),
              },
            })
          ).id;
    await addCitationMutation.mutateAsync({
      data: {
        sourceId: resolvedSourceId,
        personId,
        factType: selectedFact.factType,
        factId: selectedFact.factId,
        confidence,
        page: page.trim() === "" ? null : page,
        note: note.trim() === "" ? null : note,
      },
    });
    await onDone();
  };

  const fields = (
    <>
      {!fixedFact && (
        <Select
          aria-label={t("person.citations.whatThisCites")}
          value={factKey}
          onChange={(value) => {
            if (value) setFactKey(String(value));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {factOptions.map((option) => (
              <SelectItem key={option.key} id={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {sourceMode === "existing" ? (
        <div className="space-y-2">
          <Select
            aria-label={t("person.citations.source")}
            value={sourceId}
            onChange={(value) => {
              if (value) setSourceId(String(value));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sourcesList.map((source) => (
                <SelectItem key={source.id} id={source.id}>
                  {source.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onPress={() => {
              setSourceMode("new");
            }}
          >
            {t("person.citations.newSourceInstead")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder={t("person.citations.sourceTitle")}
            value={newSourceTitle}
            onChange={(inputEvent) => setNewSourceTitle(inputEvent.target.value)}
          />
          <Input
            placeholder={t("person.citations.authorOptional")}
            value={newSourceAuthor}
            onChange={(inputEvent) => setNewSourceAuthor(inputEvent.target.value)}
          />
          {sourcesList.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={() => {
                setSourceMode("existing");
              }}
            >
              {t("person.citations.useExistingSourceInstead")}
            </Button>
          )}
        </div>
      )}

      <Select
        aria-label={t("person.citations.confidence")}
        value={confidence}
        onChange={(value) => {
          if (value) setConfidence(confidenceSchema.parse(value));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionsFor(options, "confidence").map((option) => (
            <SelectItem key={option.key} id={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder={t("person.citations.pagePlaceholder")}
        value={page}
        onChange={(inputEvent) => setPage(inputEvent.target.value)}
      />
      <Input
        placeholder={t("person.citations.notePlaceholder")}
        value={note}
        onChange={(inputEvent) => setNote(inputEvent.target.value)}
      />

      <DialogFooter>
        <SaveButton
          isDirty={isDirty}
          isPending={pending}
          isDisabled={!canSubmit}
          {...(embedded
            ? // Not type="submit": this form is a `<div>` nested inside
              // another `<form>` (EventForm's) when embedded, and a
              // type="submit" button submits its nearest ancestor form
              // regardless of nesting depth — see the comment on
              // `SaveButton`'s `type` prop for the portal-specific version
              // of this same gotcha, hit first via the dialog-in-dialog
              // approach this embedding replaced.
              { type: "button", onPress: () => void submit() }
            : {})}
        >
          {t("common.add")}
        </SaveButton>
      </DialogFooter>
    </>
  );

  return embedded ? (
    <div className="space-y-3">{fields}</div>
  ) : (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {fields}
    </form>
  );
}
