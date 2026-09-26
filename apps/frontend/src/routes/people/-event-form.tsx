import {
  eventTypeSchema,
  joinHistoricalDateText,
  parseHistoricalDate,
  splitHistoricalDateText,
  type EventType,
} from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { labelFor, optionsFor } from "../../lib/person-display";
import { addEvent, updateEvent } from "../../server/functions/person.functions";
import { removeCitation } from "../../server/functions/source.functions";
import { CitationForm } from "./-citations-section";
import { historicalDateFieldPreview } from "./-shared";
import type { CitationRow, ConfigurableOptionRow, PersonEventRow, SourceRow } from "./-types";

/**
 * Suggested keys for the `details` bag on `EventForm`, per event type — the
 * bag itself stays a free-form `Record<string, string>` (see `EventDetails`
 * in packages/core), this is purely a frontend display/input convenience.
 * "other" has none: its free-text label and description already cover it.
 * Exported for `-life-events-card.tsx`'s read-only display to look labels
 * up from the same dictionary this form edits with.
 */
export const EVENT_DETAIL_FIELDS: Partial<Record<EventType, { key: string; label: string }[]>> = {
  christening: [
    { key: "officiant", label: "Officiant" },
    { key: "church", label: "Church" },
  ],
  burial: [
    { key: "cemetery", label: "Cemetery" },
    { key: "plot", label: "Plot" },
  ],
  cremation: [{ key: "crematorium", label: "Crematorium" }],
  immigration: [
    { key: "ship", label: "Ship name" },
    { key: "port", label: "Port" },
  ],
  emigration: [
    { key: "ship", label: "Ship name" },
    { key: "port", label: "Port" },
  ],
  naturalization: [
    { key: "country", label: "Country" },
    { key: "court", label: "Court" },
  ],
  residence: [{ key: "address", label: "Address" }],
  occupation: [
    { key: "employer", label: "Employer" },
    { key: "jobTitle", label: "Job title" },
  ],
  death: [
    { key: "causeOfDeath", label: "Cause of death" },
    { key: "informant", label: "Informant" },
  ],
};

/**
 * "birth"/"death" are ordinary `person_events` rows (see `PersonService`),
 * but the person form above owns creating them (as a dedicated pair of
 * fields) so there's only ever one canonical one of each — the generic
 * "+ Add event" dialog excludes them from its type choices accordingly. An
 * existing birth/death row is still fully editable from this list like any
 * other event (date, place, and now-relevant detail like cause of death),
 * except its type can't be changed away from what created it.
 */
export const VITAL_EVENT_TYPES = new Set(["birth", "death"]);

export function EventForm({
  personId,
  event,
  citations,
  sourcesList,
  options,
  onDone,
  onChanged,
}: {
  personId: string;
  event: PersonEventRow | null;
  citations: CitationRow[];
  sourcesList: SourceRow[];
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
  /**
   * Refreshes shared data (citations especially) without closing this
   * dialog — distinct from `onDone`, which is this form's own save/close.
   * Only exercised when `event` is set: a citation needs a real event id to
   * point at, so `EventCitations` below doesn't render for a brand-new,
   * not-yet-saved event.
   */
  onChanged: () => Promise<void>;
}) {
  const addEventMutation = useMutation({ mutationFn: addEvent });
  const updateEventMutation = useMutation({ mutationFn: updateEvent });
  const initialEventType: EventType = event?.eventType ?? "residence";
  const initialDetails = event?.details ?? {};
  const [eventType, setEventType] = useState(initialEventType);
  const [details, setDetails] = useState<Record<string, string>>(initialDetails);

  const dateSplit = splitHistoricalDateText(event?.date?.original ?? "");

  const form = useForm({
    defaultValues: {
      label: event?.label ?? "",
      dateQuality: dateSplit.quality,
      dateValue: dateSplit.value,
      dateEndValue: dateSplit.endValue,
      place: event?.place ?? "",
      notes: event?.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      const detailFields = EVENT_DETAIL_FIELDS[eventType] ?? [];
      const detailEntries = detailFields
        .map(({ key }) => [key, (details[key] ?? "").trim()] as const)
        .filter(([, fieldValue]) => fieldValue !== "");
      const dateOriginal = joinHistoricalDateText({
        quality: value.dateQuality,
        value: value.dateValue,
        endValue: value.dateEndValue,
      });
      const payload = {
        eventType,
        label: value.label.trim() === "" ? null : value.label.trim(),
        date:
          dateOriginal === null
            ? null
            : { original: dateOriginal, ...parseHistoricalDate(dateOriginal) },
        place: value.place.trim() === "" ? null : value.place,
        details: detailEntries.length > 0 ? Object.fromEntries(detailEntries) : null,
        notes: value.notes.trim() === "" ? null : value.notes,
      };
      if (event) {
        await updateEventMutation.mutateAsync({ data: { id: event.id, ...payload } });
      } else {
        await addEventMutation.mutateAsync({ data: { personId, ...payload } });
      }
      await onDone();
    },
  });

  const { isDirty: formIsDirty, isSubmitting } = useFormDirtyPending(form);
  const label = useStore(form.store, (state) => state.values.label);
  const dateQuality = useStore(form.store, (state) => state.values.dateQuality);
  const dateValue = useStore(form.store, (state) => state.values.dateValue);
  const dateEndValue = useStore(form.store, (state) => state.values.dateEndValue);
  const needsLabel = eventType === "other" && label.trim() === "";
  // eventType/details are tracked outside the form (a Select and per-type
  // detail inputs, not form.Fields), so the form's own isDirty misses a
  // change to either one — combine both.
  const isDirty =
    formIsDirty ||
    eventType !== initialEventType ||
    JSON.stringify(details) !== JSON.stringify(initialDetails);

  return (
    <form
      className="space-y-3"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Select
        aria-label="Event type"
        value={eventType}
        // Locked once it's already "birth"/"death": those are created only
        // from the person form's own Date of Birth/Death fields (so there's
        // ever just one canonical row of each), not selectable here — but an
        // existing one, once created, stays fully editable otherwise (date,
        // place, detail like cause of death).
        isDisabled={VITAL_EVENT_TYPES.has(initialEventType)}
        onChange={(value) => {
          if (value) setEventType(eventTypeSchema.parse(value));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionsFor(options, "event_type")
            // The disabled trigger above still needs its own current option
            // present to render a label from, when that's "birth"/"death".
            .filter(
              (option) => !VITAL_EVENT_TYPES.has(option.key) || option.key === initialEventType,
            )
            .map((option) => (
              <SelectItem key={option.key} id={option.key}>
                {option.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {eventType === "other" && (
        <form.Field name="label">
          {(field) => (
            <Input
              placeholder='Label — required for "other" events, e.g. "Emigrated to Canada"'
              value={field.state.value}
              onChange={(inputEvent) => field.handleChange(inputEvent.target.value)}
            />
          )}
        </form.Field>
      )}
      <HistoricalDateInput
        placeholder="Date, e.g. 1902"
        quality={dateQuality}
        onQualityChange={(quality) => form.setFieldValue("dateQuality", quality)}
        value={dateValue}
        onChange={(value) => form.setFieldValue("dateValue", value)}
        endValue={dateEndValue}
        onEndChange={(value) => form.setFieldValue("dateEndValue", value)}
        preview={historicalDateFieldPreview(dateQuality, dateValue, dateEndValue)}
      />
      <form.Field name="place">
        {(field) => (
          <Input
            placeholder="Place"
            value={field.state.value}
            onChange={(inputEvent) => field.handleChange(inputEvent.target.value)}
          />
        )}
      </form.Field>
      {(EVENT_DETAIL_FIELDS[eventType] ?? []).map((detailField) => (
        <Input
          key={detailField.key}
          placeholder={detailField.label}
          value={details[detailField.key] ?? ""}
          onChange={(inputEvent) =>
            setDetails((prev) => ({ ...prev, [detailField.key]: inputEvent.target.value }))
          }
        />
      ))}
      <form.Field name="notes">
        {(field) => (
          <MarkdownEditor
            aria-label="Notes"
            placeholder="Notes"
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      {event && (
        <EventCitations
          personId={personId}
          event={event}
          citations={citations}
          sourcesList={sourcesList}
          options={options}
          onChanged={onChanged}
        />
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting} isDisabled={needsLabel}>
          {event ? "Save" : "Add"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

/**
 * The event dialog's own citations sub-section — lets you see and manage
 * what's already cited, and cite a new (or newly-created) source, without
 * leaving the dialog. Only rendered for an existing event (see the comment
 * on `EventForm`'s `onChanged` prop for why). Reuses `CitationForm` with the
 * "what this cites" fact fixed to this event, rather than a parallel
 * implementation of the source-search/create-new-source logic.
 */
function EventCitations({
  personId,
  event,
  citations,
  sourcesList,
  options,
  onChanged,
}: {
  personId: string;
  event: PersonEventRow;
  citations: CitationRow[];
  sourcesList: SourceRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const removeCitationMutation = useMutation({ mutationFn: removeCitation });
  // Not a nested `Dialog` — see the `embedded` prop comment on `CitationForm`
  // for why stacking this component's own dialog inside the event's would
  // close both. Swapping in the form as inline content, within the same
  // dialog, sidesteps that entirely.
  const [mode, setMode] = useState<"list" | "add">("list");
  const sourceById = new Map(sourcesList.map((source) => [source.id, source]));
  const eventCitations = citations.filter(
    (citation) => citation.factType === "event" && citation.factId === event.id,
  );

  const remove = async (id: string) => {
    await removeCitationMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  if (mode === "add") {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">Add citation</p>
          <Button type="button" variant="ghost" size="sm" onPress={() => setMode("list")}>
            ← Back
          </Button>
        </div>
        <CitationForm
          personId={personId}
          sourcesList={sourcesList}
          options={options}
          embedded
          fixedFact={{
            key: `event|${event.id}`,
            factType: "event",
            factId: event.id,
            label: `Event: ${labelFor(options, "event_type", event.eventType)}${event.label ? ` (${event.label})` : ""}`,
          }}
          onDone={async () => {
            setMode("list");
            await onChanged();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase">Sources</p>
        <Button type="button" variant="ghost" size="sm" onPress={() => setMode("add")}>
          + Add citation
        </Button>
      </div>
      {eventCitations.length === 0 ? (
        <p className="text-xs text-muted-foreground">No sources cited yet.</p>
      ) : (
        eventCitations.map((citation) => {
          const source = sourceById.get(citation.sourceId);
          return (
            <div key={citation.id} className="flex items-center justify-between gap-2 text-xs">
              <div>
                <Badge variant="outline" className="mr-2">
                  {labelFor(options, "confidence", citation.confidence)}
                </Badge>
                <span className="font-medium">{source?.title ?? "Unknown source"}</span>
                {citation.page && (
                  <span className="text-muted-foreground"> · p. {citation.page}</span>
                )}
              </div>
              <RemoveButton
                itemLabel={`this citation of "${source?.title ?? "this source"}"`}
                onConfirm={() => void remove(citation.id)}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
