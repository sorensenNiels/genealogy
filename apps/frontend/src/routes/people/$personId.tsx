import type { AppRouter } from "@genealogy/backend";
import {
  calculateAge,
  confidenceSchema,
  eventTypeSchema,
  formatFullPersonName,
  formatLifespan,
  formatPersonName,
  nameVariantTypeSchema,
  parentageSchema,
  parseHistoricalDate,
  resolveHistoricalDate,
  sexSchema,
  unionStatusSchema,
  type CitationFactType,
  type Confidence,
  type EventType,
  type NameVariantType,
  type Parentage,
  type Sex,
  type UnionStatus,
} from "@genealogy/core";
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
import { Autocomplete } from "@genealogy/ui/components/autocomplete";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@genealogy/ui/components/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@genealogy/ui/components/dialog";
import {
  HistoricalDateInput,
  type HistoricalDatePreview,
} from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { Popover, PopoverContent } from "@genealogy/ui/components/popover";
import { SaveButton } from "@genealogy/ui/components/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { Switch } from "@genealogy/ui/components/switch";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { Cake, CameraIcon, Cross, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { publicBackendUrl } from "../../lib/env";
import { formatDisplayDate } from "../../lib/format-date";
import { GenderIcon, initials, labelFor, optionsFor, SEX_LABELS } from "../../lib/person-display";
import {
  addEvent,
  addName,
  addUnion,
  createPerson,
  getPersonById,
  getRelatives,
  linkParent,
  listEvents,
  listNames,
  listPersons,
  listSuffixes,
  listTitlePrefixes,
  listUnions,
  removeEvent,
  removeName,
  removePerson,
  removeUnion,
  unlinkParent,
  unlinkSpouse,
  updateEvent,
  updateName,
  updatePerson,
} from "../../server/functions/person.functions";
import { listOptions } from "../../server/functions/settings.functions";
import {
  addCitation,
  createSource,
  listCitations,
  listSources,
  removeCitation,
} from "../../server/functions/source.functions";

export const Route = createFileRoute("/people/$personId")({
  component: PersonDetailRoute,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PersonRow = RouterOutputs["person"]["byId"];
type ParentRow = RouterOutputs["person"]["relatives"]["parents"][number];
type NameVariantRow = RouterOutputs["person"]["listNames"][number];
type PersonEventRow = RouterOutputs["person"]["listEvents"][number];
type UnionRow = RouterOutputs["person"]["listUnions"][number];
type SourceRow = RouterOutputs["source"]["listSources"][number];
type CitationRow = RouterOutputs["source"]["listCitations"][number];
type ConfigurableOptionRow = RouterOutputs["settings"]["listOptions"][number];
type RelativeKind = "spouse" | "child";

const NO_UNIONS: UnionRow[] = [];

// A starting point, not a closed vocabulary — PersonFields' Title/prefix and
// Suffix fields merge these with whatever's already been typed for other
// people (see the listTitlePrefixes/listSuffixes queries), so the
// autocomplete favors values already in use once there are any.
const STANDARD_TITLE_PREFIXES = [
  "Mr.",
  "Mrs.",
  "Miss",
  "Ms.",
  "Dr.",
  "Rev.",
  "Fr.",
  "Prof.",
  "Sir",
  "Lady",
  "Lord",
  "Capt.",
  "Col.",
  "Maj.",
  "Gen.",
  "Lt.",
  "Sgt.",
  "Hon.",
];
const STANDARD_SUFFIXES = [
  "Jr.",
  "Sr.",
  "II",
  "III",
  "IV",
  "V",
  "Esq.",
  "PhD",
  "MD",
  "DDS",
  "DVM",
  "RN",
];

/**
 * Suggested keys for the `details` bag on `EventForm`, per event type — the
 * bag itself stays a free-form `Record<string, string>` (see `EventDetails`
 * in packages/core), this is purely a frontend display/input convenience.
 * "other" has none: its free-text label and description already cover it.
 */
const EVENT_DETAIL_FIELDS: Partial<Record<EventType, { key: string; label: string }[]>> = {
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
};

function PersonDetailRoute() {
  const { personId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const person = useQuery({
    queryKey: ["person", "byId", personId],
    queryFn: () => getPersonById({ data: { id: personId } }),
  });
  const relatives = useQuery({
    queryKey: ["person", "relatives", personId],
    queryFn: () => getRelatives({ data: { id: personId } }),
  });
  const names = useQuery({
    queryKey: ["person", "listNames", personId],
    queryFn: () => listNames({ data: { personId } }),
  });
  const events = useQuery({
    queryKey: ["person", "listEvents", personId],
    queryFn: () => listEvents({ data: { personId } }),
  });
  const unions = useQuery({
    queryKey: ["person", "listUnions", personId],
    queryFn: () => listUnions({ data: { personId } }),
  });
  const sourcesList = useQuery({
    queryKey: ["source", "listSources"],
    queryFn: () => listSources(),
  });
  const citationsList = useQuery({
    queryKey: ["source", "listCitations", personId],
    queryFn: () => listCitations({ data: { personId } }),
  });
  const options = useQuery({ queryKey: ["settings", "listOptions"], queryFn: () => listOptions() });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["person", "byId", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "relatives", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listTitlePrefixes"] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listSuffixes"] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listNames", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listEvents", personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", "listUnions", personId] }),
      queryClient.invalidateQueries({ queryKey: ["source", "listSources"] }),
      queryClient.invalidateQueries({ queryKey: ["source", "listCitations", personId] }),
    ]);
  };

  if (person.isPending) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (person.isError) {
    return <p className="text-destructive">Could not load person: {person.error.message}</p>;
  }

  const parents = relatives.data?.parents ?? [];
  const spouses = relatives.data?.spouses ?? [];
  const children = relatives.data?.children ?? [];
  const unionRows = unions.data ?? [];
  // Nobody already related (in any direction) should be offered again as a pick.
  const excludeIds = new Set([
    personId,
    ...parents.map((p) => p.id),
    ...spouses.map((p) => p.id),
    ...children.map((p) => p.id),
  ]);
  // Mirrors the guard in PersonService.remove — a union can outlive the
  // SPOUSE_OF edge it came from (see unlinkSpouse), so it counts too.
  const canDelete =
    parents.length === 0 && spouses.length === 0 && children.length === 0 && unionRows.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          to="/people/$personId/print"
          params={{ personId }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Print summary →
        </Link>
      </div>
      <PersonFields
        person={person.data}
        nicknames={(names.data ?? [])
          .filter((name) => name.nameType === "nickname")
          .map((name) => name.given)}
        names={names.data ?? []}
        options={options.data ?? []}
        onChanged={refresh}
        canDelete={canDelete}
        onDeleted={() => navigate({ to: "/people" })}
      />
      <div className="grid gap-6 md:grid-cols-3">
        <ParentsSection
          personId={personId}
          parents={parents}
          excludeIds={excludeIds}
          options={options.data ?? []}
          onChanged={refresh}
        />
        <RelativesSection
          title="Spouses"
          kind="spouse"
          personId={personId}
          relatives={spouses}
          excludeIds={excludeIds}
          options={options.data ?? []}
          onChanged={refresh}
          unions={unions.data ?? []}
        />
        <RelativesSection
          title="Children"
          kind="child"
          personId={personId}
          relatives={children}
          excludeIds={excludeIds}
          options={options.data ?? []}
          onChanged={refresh}
        />
      </div>
      <EventsSection
        personId={personId}
        events={events.data ?? []}
        options={options.data ?? []}
        onChanged={refresh}
      />
      <CitationsSection
        personId={personId}
        citations={citationsList.data ?? []}
        sourcesList={sourcesList.data ?? []}
        names={names.data ?? []}
        events={events.data ?? []}
        unions={unions.data ?? []}
        options={options.data ?? []}
        onChanged={refresh}
      />
    </div>
  );
}

function PersonFields({
  person,
  nicknames,
  names,
  options,
  onChanged,
  canDelete,
  onDeleted,
}: {
  person: PersonRow;
  nicknames: string[];
  names: NameVariantRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const updatePersonMutation = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });
  const removePersonMutation = useMutation({ mutationFn: removePerson, onSuccess: onDeleted });
  const removeNameMutation = useMutation({ mutationFn: removeName });
  const titlePrefixesQuery = useQuery({
    queryKey: ["person", "listTitlePrefixes"],
    queryFn: () => listTitlePrefixes(),
  });
  const suffixesQuery = useQuery({
    queryKey: ["person", "listSuffixes"],
    queryFn: () => listSuffixes(),
  });
  const titlePrefixOptions = mergeOptions(STANDARD_TITLE_PREFIXES, titlePrefixesQuery.data);
  const suffixOptions = mergeOptions(STANDARD_SUFFIXES, suffixesQuery.data);
  const [addNameOpen, setAddNameOpen] = useState(false);

  const removeNameById = async (id: string) => {
    await removeNameMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  const form = useForm({
    defaultValues: {
      given: person.given,
      surname: person.surname,
      sex: person.sex,
      titlePrefix: person.titlePrefix ?? "",
      suffix: person.suffix ?? "",
      birthOriginal: person.birth?.original ?? "",
      birthPlace: person.birthPlace ?? "",
      deathOriginal: person.death?.original ?? "",
      deathPlace: person.deathPlace ?? "",
      notes: person.notes ?? "",
      isLiving: person.isLiving,
    },
    onSubmit: async ({ value, formApi }) => {
      await updatePersonMutation.mutateAsync({
        data: {
          id: person.id,
          given: value.given,
          surname: value.surname,
          sex: value.sex,
          titlePrefix: value.titlePrefix.trim() === "" ? null : value.titlePrefix,
          suffix: value.suffix.trim() === "" ? null : value.suffix,
          // Bounds are recomputed from the current wording on every save, not
          // carried over from what was previously stored — otherwise editing
          // the text alone (without it happening to still parse to the same
          // bounds) would leave a stale earliest/latest attached to new words.
          birth:
            value.birthOriginal.trim() === ""
              ? null
              : {
                  original: value.birthOriginal.trim(),
                  ...parseHistoricalDate(value.birthOriginal.trim()),
                },
          birthPlace: value.birthPlace.trim() === "" ? null : value.birthPlace,
          death:
            value.deathOriginal.trim() === ""
              ? null
              : {
                  original: value.deathOriginal.trim(),
                  ...parseHistoricalDate(value.deathOriginal.trim()),
                },
          deathPlace: value.deathPlace.trim() === "" ? null : value.deathPlace,
          notes: value.notes.trim() === "" ? null : value.notes,
          isLiving: value.isLiving,
        },
      });
      // Rebaselines dirty-tracking against what was just saved — the values
      // themselves don't change, only the "clean" snapshot they're compared to.
      formApi.reset(value);
    },
  });

  const isLiving = useStore(form.store, (state) => state.values.isLiving);
  const isDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  const age = calculateAge(person);
  const birthDisplay = formatDisplayDate(person.birth);
  const deathDisplay = formatDisplayDate(person.death);
  const birthLine = birthDisplay
    ? `Born ${birthDisplay}${person.isLiving && age !== null ? ` (${age})` : ""}`
    : null;
  const deathLine = !person.isLiving
    ? `${deathDisplay ? `Died ${deathDisplay}` : "Died"}${age !== null ? ` (${age})` : ""}`
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GenderIcon sex={person.sex} />
            {formatFullPersonName({ ...person, nickname: nicknames })}
            <CopyableText value={person.publicId} className="font-normal" />
          </CardTitle>
          {birthLine && (
            <CardDescription className="flex items-center gap-1.5">
              <Cake className="size-3.5 shrink-0" aria-hidden="true" />
              {birthLine}
            </CardDescription>
          )}
          {deathLine && (
            <CardDescription className="flex items-center gap-1.5">
              <Cross className="size-3.5 shrink-0" aria-hidden="true" />
              {deathLine}
            </CardDescription>
          )}
        </div>
        <PersonPhoto person={person} onChanged={onChanged} />
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            // TanStack Form rethrows onSubmit's rejection after resetting
            // isSubmitting — caught here only to avoid an unhandled
            // rejection; the failure itself is surfaced via update.isError
            // below.
            void form.handleSubmit().catch(() => {});
          }}
        >
          <div className="flex items-end justify-between gap-4 sm:col-span-2">
            <form.Field name="sex">
              {(field) => (
                <LabeledField label="Gender">
                  <Select
                    aria-label="Gender"
                    value={field.state.value}
                    onChange={(value) => {
                      if (value) field.handleChange(sexSchema.parse(value));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sexSchema.options.map((option) => (
                        <SelectItem key={option} id={option}>
                          {SEX_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </LabeledField>
              )}
            </form.Field>
            <form.Field name="isLiving">
              {(field) => (
                <Switch
                  isSelected={field.state.value}
                  onChange={(isSelected) => field.handleChange(isSelected)}
                >
                  Living
                </Switch>
              )}
            </form.Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
            <form.Field name="given">
              {(field) => (
                <LabeledField label="First names">
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </LabeledField>
              )}
            </form.Field>
            <form.Field name="surname">
              {(field) => (
                <LabeledField label="Last names">
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </LabeledField>
              )}
            </form.Field>
          </div>
          <div className="space-y-2 text-sm sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Alternate names</span>
              <Dialog isOpen={addNameOpen} onOpenChange={setAddNameOpen}>
                <Button type="button" variant="ghost" size="icon" aria-label="Add alternate name">
                  <PlusIcon className="size-4" />
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add alternate name</DialogTitle>
                  </DialogHeader>
                  <NameForm
                    personId={person.id}
                    name={null}
                    options={options}
                    onDone={async () => {
                      setAddNameOpen(false);
                      await onChanged();
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
            {names.length > 0 && (
              <div className="space-y-2">
                {names.map((name) => (
                  <NameRow
                    key={name.id}
                    personId={person.id}
                    name={name}
                    options={options}
                    onChanged={onChanged}
                    onRemove={() => void removeNameById(name.id)}
                  />
                ))}
              </div>
            )}
          </div>
          <form.Field name="titlePrefix">
            {(field) => (
              <LabeledField label="Title / prefix">
                <Autocomplete
                  aria-label="Title / prefix"
                  placeholder="e.g. Dr., Rev."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  options={titlePrefixOptions}
                  isClearable
                />
              </LabeledField>
            )}
          </form.Field>
          <form.Field name="suffix">
            {(field) => (
              <LabeledField label="Suffix">
                <Autocomplete
                  aria-label="Suffix"
                  placeholder="e.g. Jr., III"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  options={suffixOptions}
                  isClearable
                />
              </LabeledField>
            )}
          </form.Field>
          <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
            <form.Field name="birthOriginal">
              {(field) => (
                <LabeledField label="Date of Birth">
                  <HistoricalDateInput
                    placeholder="e.g. abt 1854"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    preview={historicalDatePreview(field.state.value)}
                  />
                </LabeledField>
              )}
            </form.Field>
            <form.Field name="birthPlace">
              {(field) => (
                <LabeledField label="Place of Birth">
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </LabeledField>
              )}
            </form.Field>
          </div>
          {!isLiving && (
            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
              <form.Field name="deathOriginal">
                {(field) => (
                  <LabeledField label="Date of Death">
                    <HistoricalDateInput
                      placeholder="e.g. 12 MAR 1901"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={field.handleChange}
                      preview={historicalDatePreview(field.state.value)}
                    />
                  </LabeledField>
                )}
              </form.Field>
              <form.Field name="deathPlace">
                {(field) => (
                  <LabeledField label="Place of Death">
                    <Input
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </LabeledField>
                )}
              </form.Field>
            </div>
          )}
          <form.Field name="notes">
            {(field) => (
              <LabeledField label="Notes" className="sm:col-span-2">
                <Input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </LabeledField>
            )}
          </form.Field>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <SaveButton isDirty={isDirty} isPending={isSubmitting}>
              Save
            </SaveButton>
            {canDelete && (
              <AlertDialog>
                <Button type="button" variant="outline" className="text-destructive">
                  <Trash2Icon /> Delete
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {formatFullPersonName(person)}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes them and everything recorded about them — alternate
                      names, life events, sources and citations. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onPress={() => removePersonMutation.mutate({ data: { id: person.id } })}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {updatePersonMutation.isError && (
            <p className="text-sm text-destructive sm:col-span-2">
              {updatePersonMutation.error.message}
            </p>
          )}
          {removePersonMutation.isError && (
            <p className="text-sm text-destructive sm:col-span-2">
              {removePersonMutation.error.message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Standard values first (recognizable, always offered), then whatever's
 * already recorded for other people that isn't already in that list —
 * de-duplicated and alphabetized, so a value someone already used shows up
 * without drowning out the common ones.
 */
function mergeOptions(
  standard: readonly string[],
  recorded: readonly string[] | undefined,
): string[] {
  const extra = (recorded ?? [])
    .filter((value) => !standard.includes(value))
    .toSorted((a, b) => a.localeCompare(b));
  return [...standard, ...extra];
}

/** Shared by every date field in this file — see HistoricalDateInput. */
function historicalDatePreview(text: string): HistoricalDatePreview | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const { display } = resolveHistoricalDate(trimmed);
  return display ? { text: display, status: "parsed" } : { text: trimmed, status: "unparsed" };
}

/**
 * Upload/delete go through this app's own /api/people/$id/photo proxy route
 * (same-origin, cookies ride along automatically) — see
 * routes/api/people/$id/photo.ts. The `<img>` read below still points
 * directly at apps/backend: it's an unauthenticated static file, and a plain
 * `<img src>` isn't subject to CORS regardless, so proxying it would add
 * nothing. See `publicBackendUrl`'s doc comment in lib/env.ts.
 */
function PersonPhoto({ person, onChanged }: { person: PersonRow; onChanged: () => Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/people/${person.id}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Photo upload failed: ${response.status}`);
      }
      await onChanged();
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    await fetch(`/api/people/${person.id}/photo`, { method: "DELETE" });
    await onChanged();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        className="group relative size-16 rounded-full p-0"
        isDisabled={uploading}
        onPress={() => fileInputRef.current?.click()}
        aria-label={photoUrl ? "Change photo" : "Upload photo"}
      >
        <Avatar className="size-16">
          {photoUrl && <AvatarImage src={photoUrl} alt={formatPersonName(person)} />}
          <AvatarFallback className="text-base">{initials(person)}</AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-data-hovered:opacity-100">
          {uploading ? (
            <span className="text-xs">…</span>
          ) : (
            <CameraIcon className="size-5" aria-hidden="true" />
          )}
        </span>
      </Button>
      {photoUrl && <RemoveButton itemLabel="this photo" onConfirm={() => void remove()} />}
    </div>
  );
}

/** A "Remove" button that requires an explicit confirmation before it acts. */
function RemoveButton({
  itemLabel,
  onConfirm,
  trigger,
}: {
  itemLabel: string;
  onConfirm: () => void;
  /** Defaults to a plain "Remove" text button. */
  trigger?: ReactNode;
}) {
  return (
    <AlertDialog>
      {trigger ?? (
        <Button variant="ghost" size="sm">
          Remove
        </Button>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onPress={onConfirm}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LabeledField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`space-y-1 text-sm ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function RelativesSection({
  title,
  kind,
  personId,
  relatives,
  excludeIds,
  options,
  onChanged,
  unions = NO_UNIONS,
}: {
  title: string;
  kind: RelativeKind;
  personId: string;
  relatives: PersonRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  /** Only meaningful for the Spouses section — shown alongside each spouse row. */
  unions?: UnionRow[];
}) {
  const unlinkParentMutation = useMutation({ mutationFn: unlinkParent });
  const unlinkSpouseMutation = useMutation({ mutationFn: unlinkSpouse });

  const remove = async (relativeId: string) => {
    if (kind === "spouse") {
      await unlinkSpouseMutation.mutateAsync({ data: { aId: personId, bId: relativeId } });
    } else {
      await unlinkParentMutation.mutateAsync({ data: { parentId: personId, childId: relativeId } });
    }
    await onChanged();
  };

  // unlinkSpouse deliberately leaves the union record behind (see its
  // comment in person.service.ts) — divorcing someone shouldn't erase the
  // marriage record. That means a union can point at someone no longer in
  // `relatives` at all: this page's own "Delete person" guard blocks on any
  // union regardless, so without surfacing these, a person can end up
  // impossible to delete with no visible reason why.
  const orphanedUnions =
    kind === "spouse"
      ? unions.filter(
          (union) => !relatives.some((r) => r.id === union.personAId || r.id === union.personBId),
        )
      : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <AddRelative
          kind={kind}
          personId={personId}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
        />
      </CardHeader>
      <CardContent className="space-y-2">
        {relatives.map((relative) => {
          const union = unions.find(
            (candidate) =>
              (candidate.personAId === personId && candidate.personBId === relative.id) ||
              (candidate.personBId === personId && candidate.personAId === relative.id),
          );
          return (
            <div key={relative.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <Link
                  to="/people/$personId"
                  params={{ personId: relative.id }}
                  className="hover:underline"
                >
                  {formatPersonName(relative)}
                  {formatLifespan(relative) && (
                    <span className="ml-1 text-muted-foreground">({formatLifespan(relative)})</span>
                  )}
                </Link>
                {union && (
                  <p className="text-xs text-muted-foreground">
                    {labelFor(options, "union_status", union.status)}
                    {union.startDate ? ` · ${formatDisplayDate(union.startDate)}` : ""}
                    {union.startPlace ? ` in ${union.startPlace}` : ""}
                  </p>
                )}
              </div>
              <RemoveButton
                itemLabel={`the relationship with ${formatPersonName(relative)}`}
                onConfirm={() => void remove(relative.id)}
              />
            </div>
          );
        })}
        {orphanedUnions.map((union) => (
          <OrphanedUnionRow
            key={union.id}
            personId={personId}
            union={union}
            options={options}
            onChanged={onChanged}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * A union whose other side is no longer a linked spouse (see
 * `orphanedUnions` above) — still blocks deleting either person in it, so
 * this is the only place a user can find and remove one. `union` only has
 * the other person's id, not their name, so this fetches it directly rather
 * than widening `listUnions`'s response shape for a rarely-hit case.
 */
function OrphanedUnionRow({
  personId,
  union,
  options,
  onChanged,
}: {
  personId: string;
  union: UnionRow;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const otherId = union.personAId === personId ? union.personBId : union.personAId;
  const other = useQuery({
    queryKey: ["person", "byId", otherId],
    queryFn: () => getPersonById({ data: { id: otherId } }),
  });
  const removeUnionMutation = useMutation({ mutationFn: removeUnion });

  const remove = async () => {
    await removeUnionMutation.mutateAsync({ data: { id: union.id } });
    await onChanged();
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        {other.data ? (
          <Link to="/people/$personId" params={{ personId: otherId }} className="hover:underline">
            {formatPersonName(other.data)}
          </Link>
        ) : (
          <span className="text-muted-foreground">Unknown person</span>
        )}
        <p className="text-xs text-muted-foreground">
          {labelFor(options, "union_status", union.status)} · no longer linked
          {union.startDate ? ` · ${formatDisplayDate(union.startDate)}` : ""}
          {union.startPlace ? ` in ${union.startPlace}` : ""}
        </p>
      </div>
      <RemoveButton itemLabel="this union record" onConfirm={() => void remove()} />
    </div>
  );
}

function AddRelative({
  kind,
  personId,
  excludeIds,
  options: allOptions,
  onChanged,
}: {
  kind: RelativeKind;
  personId: string;
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [parentage, setParentage] = useState<Parentage>("unknown");
  const [unionStatus, setUnionStatus] = useState<UnionStatus>("married");
  const [unionDate, setUnionDate] = useState("");
  const [unionPlace, setUnionPlace] = useState("");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open && mode === "search",
  });

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const addUnionMutation = useMutation({ mutationFn: addUnion });

  const options = (search.data?.items ?? []).filter((candidate) => !excludeIds.has(candidate.id));

  const link = async (target: PersonRow) => {
    if (kind === "spouse") {
      await addUnionMutation.mutateAsync({
        data: {
          personAId: personId,
          personBId: target.id,
          status: unionStatus,
          startDate:
            unionDate.trim() === ""
              ? null
              : { original: unionDate.trim(), ...parseHistoricalDate(unionDate.trim()) },
          startPlace: unionPlace.trim() === "" ? null : unionPlace,
        },
      });
    } else {
      await linkParentMutation.mutateAsync({
        data: { parentId: personId, childId: target.id, parentage },
      });
    }
    setOpen(false);
    await onChanged();
  };

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setMode("search");
          setQuery("");
        }
      }}
    >
      <Button variant="outline" size="sm">
        + Add
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "spouse" ? "Add spouse" : "Add child"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {kind !== "spouse" && (
            <Select
              aria-label="Parentage"
              value={parentage}
              onChange={(value) => {
                if (value) setParentage(parentageSchema.parse(value));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsFor(allOptions, "parentage").map((option) => (
                  <SelectItem key={option.key} id={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {kind === "spouse" && (
            <div className="space-y-2">
              <Select
                aria-label="Union status"
                value={unionStatus}
                onChange={(value) => {
                  if (value) setUnionStatus(unionStatusSchema.parse(value));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFor(allOptions, "union_status").map((option) => (
                    <SelectItem key={option.key} id={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <HistoricalDateInput
                placeholder="Marriage date, e.g. 12 JUN 1920"
                value={unionDate}
                onChange={setUnionDate}
                preview={historicalDatePreview(unionDate)}
              />
              <Input
                placeholder="Marriage place"
                value={unionPlace}
                onChange={(event) => setUnionPlace(event.target.value)}
              />
            </div>
          )}
          {mode === "search" ? (
            <>
              <Combobox<PersonRow>
                aria-label="Search people"
                items={options}
                inputValue={query}
                onInputChange={setQuery}
                onChange={(value) => {
                  const target = options.find((candidate) => candidate.id === value);
                  if (target) void link(target);
                }}
              >
                <ComboboxInput placeholder="Search people…" />
                <ComboboxContent<PersonRow>
                  renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
                >
                  {(item) => (
                    <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
                      {formatPersonName(item)}
                      {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
                    </ComboboxItem>
                  )}
                </ComboboxContent>
              </Combobox>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onPress={() => setMode("create")}
              >
                + Create new person
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onPress={() => setMode("search")}>
                ← Search instead
              </Button>
              <CreateAndLinkForm
                kind={kind}
                personId={personId}
                parentage={parentage}
                unionStatus={unionStatus}
                unionDate={unionDate}
                unionPlace={unionPlace}
                onDone={async () => {
                  setOpen(false);
                  await onChanged();
                }}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateAndLinkForm({
  kind,
  personId,
  parentage,
  unionStatus,
  unionDate,
  unionPlace,
  onDone,
}: {
  kind: RelativeKind;
  personId: string;
  parentage: Parentage;
  unionStatus: UnionStatus;
  unionDate: string;
  unionPlace: string;
  onDone: () => Promise<void>;
}) {
  const createPersonMutation = useMutation({ mutationFn: createPerson });
  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const addUnionMutation = useMutation({ mutationFn: addUnion });

  const form = useForm({
    defaultValues: { given: "", surname: "" },
    onSubmit: async ({ value, formApi }) => {
      const created = await createPersonMutation.mutateAsync({ data: value });
      if (kind === "spouse") {
        await addUnionMutation.mutateAsync({
          data: {
            personAId: personId,
            personBId: created.id,
            status: unionStatus,
            startDate:
              unionDate.trim() === ""
                ? null
                : { original: unionDate.trim(), ...parseHistoricalDate(unionDate.trim()) },
            startPlace: unionPlace.trim() === "" ? null : unionPlace,
          },
        });
      } else {
        await linkParentMutation.mutateAsync({
          data: { parentId: personId, childId: created.id, parentage },
        });
      }
      formApi.reset();
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
      <form.Field name="given">
        {(field) => (
          <Input
            placeholder="First names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="surname">
        {(field) => (
          <Input
            placeholder="Last names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create and link"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

/**
 * Parents get their own layout rather than reusing RelativesSection: a birth
 * father and mother are the common case and read better as named slots than
 * as an undifferentiated list, while adoptive/step/foster parents — and any
 * birth parent whose sex isn't recorded, or a third birth parent a source
 * disagrees about — fall through to a tagged "Other parents" list instead of
 * being forced into a slot that wouldn't be accurate.
 */
function ParentsSection({
  personId,
  parents,
  excludeIds,
  options,
  onChanged,
}: {
  personId: string;
  parents: ParentRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const unlinkParentMutation = useMutation({ mutationFn: unlinkParent });

  const remove = async (parentId: string) => {
    await unlinkParentMutation.mutateAsync({ data: { parentId, childId: personId } });
    await onChanged();
  };

  const father = parents.find((parent) => parent.parentage === "birth" && parent.sex === "M");
  const mother = parents.find((parent) => parent.parentage === "birth" && parent.sex === "F");
  const others = parents.filter((parent) => parent !== father && parent !== mother);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <ParentSlot
            label="Father"
            personId={personId}
            parent={father}
            presetSex="M"
            excludeIds={excludeIds}
            onRemove={remove}
            onChanged={onChanged}
          />
          <ParentSlot
            label="Mother"
            personId={personId}
            parent={mother}
            presetSex="F"
            excludeIds={excludeIds}
            onRemove={remove}
            onChanged={onChanged}
          />
        </div>
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Other parents</span>
            <AddOtherParent
              personId={personId}
              excludeIds={excludeIds}
              options={options}
              onChanged={onChanged}
            />
          </div>
          {others.map((parent) => (
            <div key={parent.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Link
                  to="/people/$personId"
                  params={{ personId: parent.id }}
                  className="hover:underline"
                >
                  {formatPersonName(parent)}
                  {formatLifespan(parent) && (
                    <span className="ml-1 text-muted-foreground">({formatLifespan(parent)})</span>
                  )}
                </Link>
                <Badge variant="outline">{labelFor(options, "parentage", parent.parentage)}</Badge>
              </div>
              <RemoveButton
                itemLabel={`the relationship with ${formatPersonName(parent)}`}
                onConfirm={() => void remove(parent.id)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ParentSlot({
  label,
  personId,
  parent,
  presetSex,
  excludeIds,
  onRemove,
  onChanged,
}: {
  label: string;
  personId: string;
  parent: ParentRow | undefined;
  presetSex: Sex;
  excludeIds: Set<string>;
  onRemove: (parentId: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  if (!parent) {
    return (
      <AddParentSlot
        label={label}
        personId={personId}
        presetSex={presetSex}
        excludeIds={excludeIds}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <Link to="/people/$personId" params={{ personId: parent.id }} className="hover:underline">
          {formatPersonName(parent)}
          {formatLifespan(parent) && (
            <span className="ml-1 text-muted-foreground">({formatLifespan(parent)})</span>
          )}
        </Link>
      </div>
      <RemoveButton
        itemLabel={`the relationship with ${formatPersonName(parent)}`}
        onConfirm={() => void onRemove(parent.id)}
      />
    </div>
  );
}

/** Fills the Father/Mother slot: parentage is always "birth", so there's nothing to pick. */
function AddParentSlot({
  label,
  personId,
  presetSex,
  excludeIds,
  onChanged,
}: {
  label: string;
  personId: string;
  presetSex: Sex;
  excludeIds: Set<string>;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open,
  });

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const options = (search.data?.items ?? []).filter((candidate) => !excludeIds.has(candidate.id));

  const link = async (target: PersonRow) => {
    await linkParentMutation.mutateAsync({
      data: { parentId: target.id, childId: personId, parentage: "birth" },
    });
    setOpen(false);
    setQuery("");
    await onChanged();
  };

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="w-full justify-start">
        + Add {label.toLowerCase()}
      </Button>
      <PopoverContent className="w-80 space-y-3">
        <Combobox<PersonRow>
          aria-label={`Search for ${label.toLowerCase()}`}
          items={options}
          inputValue={query}
          onInputChange={setQuery}
          onChange={(value) => {
            const target = options.find((candidate) => candidate.id === value);
            if (target) void link(target);
          }}
        >
          <ComboboxInput placeholder="Search people…" />
          <ComboboxContent<PersonRow>
            renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
          >
            {(item) => (
              <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
                <span className="flex items-center gap-1.5">
                  <GenderIcon sex={item.sex} className="size-3.5" />
                  {formatPersonName(item)}
                  {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
                </span>
              </ComboboxItem>
            )}
          </ComboboxContent>
        </Combobox>
        <Dialog isOpen={createOpen} onOpenChange={setCreateOpen}>
          <Button variant="ghost" size="sm" className="w-full">
            + Create new person
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New {label.toLowerCase()}</DialogTitle>
            </DialogHeader>
            <CreateAndLinkParentForm
              personId={personId}
              parentage="birth"
              presetSex={presetSex}
              onDone={async () => {
                setCreateOpen(false);
                setOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </PopoverContent>
    </Popover>
  );
}

/** Adoptive/step/foster parents, or any birth parent that doesn't fit a slot. */
function AddOtherParent({
  personId,
  excludeIds,
  options: allOptions,
  onChanged,
}: {
  personId: string;
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [parentage, setParentage] = useState<Parentage>("unknown");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open,
  });

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const options = (search.data?.items ?? []).filter((candidate) => !excludeIds.has(candidate.id));

  const link = async (target: PersonRow) => {
    await linkParentMutation.mutateAsync({
      data: { parentId: target.id, childId: personId, parentage },
    });
    setOpen(false);
    setQuery("");
    await onChanged();
  };

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm">
        + Add
      </Button>
      <PopoverContent className="w-80 space-y-3">
        <Select
          aria-label="Parentage"
          value={parentage}
          onChange={(value) => {
            if (value) setParentage(parentageSchema.parse(value));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {optionsFor(allOptions, "parentage").map((option) => (
              <SelectItem key={option.key} id={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Combobox<PersonRow>
          aria-label="Search people"
          items={options}
          inputValue={query}
          onInputChange={setQuery}
          onChange={(value) => {
            const target = options.find((candidate) => candidate.id === value);
            if (target) void link(target);
          }}
        >
          <ComboboxInput placeholder="Search people…" />
          <ComboboxContent<PersonRow>
            renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
          >
            {(item) => (
              <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
                {formatPersonName(item)}
                {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
              </ComboboxItem>
            )}
          </ComboboxContent>
        </Combobox>
        <Dialog isOpen={createOpen} onOpenChange={setCreateOpen}>
          <Button variant="ghost" size="sm" className="w-full">
            + Create new person
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New person</DialogTitle>
            </DialogHeader>
            <CreateAndLinkParentForm
              personId={personId}
              parentage={parentage}
              presetSex={null}
              onDone={async () => {
                setCreateOpen(false);
                setOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </PopoverContent>
    </Popover>
  );
}

function CreateAndLinkParentForm({
  personId,
  parentage,
  presetSex,
  onDone,
}: {
  personId: string;
  parentage: Parentage;
  presetSex: Sex | null;
  onDone: () => Promise<void>;
}) {
  const createPersonMutation = useMutation({ mutationFn: createPerson });
  const linkParentMutation = useMutation({ mutationFn: linkParent });

  const form = useForm({
    defaultValues: { given: "", surname: "" },
    onSubmit: async ({ value, formApi }) => {
      const created = await createPersonMutation.mutateAsync({
        data: presetSex ? { ...value, sex: presetSex } : value,
      });
      await linkParentMutation.mutateAsync({
        data: { parentId: created.id, childId: personId, parentage },
      });
      formApi.reset();
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
      <form.Field name="given">
        {(field) => (
          <Input
            placeholder="First names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="surname">
        {(field) => (
          <Input
            placeholder="Last names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create and link"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

function NameRow({
  personId,
  name,
  options,
  onChanged,
  onRemove,
}: {
  personId: string;
  name: NameVariantRow;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  onRemove: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        <Badge variant="outline" className="mr-2">
          {labelFor(options, "name_variant_type", name.nameType)}
        </Badge>
        <span>{[name.given, name.surname].filter(Boolean).join(" ")}</span>
        {name.since && (
          <span className="ml-1 text-muted-foreground">
            (since {formatDisplayDate(name.since)})
          </span>
        )}
        {name.notes && <p className="text-xs text-muted-foreground">{name.notes}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Dialog isOpen={editOpen} onOpenChange={setEditOpen}>
          <Button type="button" variant="ghost" size="icon" aria-label="Edit alternate name">
            <PencilIcon className="size-4" />
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit alternate name</DialogTitle>
            </DialogHeader>
            <NameForm
              personId={personId}
              name={name}
              options={options}
              onDone={async () => {
                setEditOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
        <RemoveButton
          itemLabel={`the alternate name "${[name.given, name.surname].filter(Boolean).join(" ")}"`}
          onConfirm={onRemove}
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label="Remove alternate name">
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

function NameForm({
  personId,
  name,
  options,
  onDone,
}: {
  personId: string;
  name: NameVariantRow | null;
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const addNameMutation = useMutation({ mutationFn: addName });
  const updateNameMutation = useMutation({ mutationFn: updateName });
  const initialNameType: NameVariantType = name?.nameType ?? "birth";
  const [nameType, setNameType] = useState(initialNameType);

  const form = useForm({
    defaultValues: {
      given: name?.given ?? "",
      surname: name?.surname ?? "",
      sinceOriginal: name?.since?.original ?? "",
      notes: name?.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      const payload = {
        nameType,
        given: value.given,
        surname: value.surname,
        since:
          value.sinceOriginal.trim() === ""
            ? null
            : {
                original: value.sinceOriginal.trim(),
                ...parseHistoricalDate(value.sinceOriginal.trim()),
              },
        notes: value.notes.trim() === "" ? null : value.notes,
      };
      if (name) {
        await updateNameMutation.mutateAsync({ data: { id: name.id, ...payload } });
      } else {
        await addNameMutation.mutateAsync({ data: { personId, ...payload } });
      }
      await onDone();
    },
  });

  const formIsDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  // nameType is tracked outside the form (it drives a Select, not a form.Field),
  // so the form's own isDirty misses a type-only change — combine both.
  const isDirty = formIsDirty || nameType !== initialNameType;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Select
        aria-label="Name type"
        value={nameType}
        onChange={(value) => {
          if (value) setNameType(nameVariantTypeSchema.parse(value));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionsFor(options, "name_variant_type").map((option) => (
            <SelectItem key={option.key} id={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <form.Field name="given">
        {(field) => (
          <Input
            placeholder="First names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="surname">
        {(field) => (
          <Input
            placeholder="Last names"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="sinceOriginal">
        {(field) => (
          <HistoricalDateInput
            placeholder="Since, e.g. 12 JUN 1998"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
            preview={historicalDatePreview(field.state.value)}
          />
        )}
      </form.Field>
      <form.Field name="notes">
        {(field) => (
          <Input
            placeholder="Notes"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {name ? "Save" : "Add"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

function EventsSection({
  personId,
  events,
  options,
  onChanged,
}: {
  personId: string;
  events: PersonEventRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const removeEventMutation = useMutation({ mutationFn: removeEvent });
  const [addOpen, setAddOpen] = useState(false);

  const remove = async (id: string) => {
    await removeEventMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Life events</CardTitle>
        <Dialog isOpen={addOpen} onOpenChange={setAddOpen}>
          <Button variant="outline" size="sm">
            + Add
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add event</DialogTitle>
            </DialogHeader>
            <EventForm
              personId={personId}
              event={null}
              options={options}
              onDone={async () => {
                setAddOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.map((event) => (
          <EventRow
            key={event.id}
            personId={personId}
            event={event}
            options={options}
            onChanged={onChanged}
            onRemove={() => void remove(event.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function EventRow({
  personId,
  event,
  options,
  onChanged,
  onRemove,
}: {
  personId: string;
  event: PersonEventRow;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  onRemove: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        <Badge variant="outline" className="mr-2">
          {labelFor(options, "event_type", event.eventType)}
        </Badge>
        {event.eventType === "other" && event.label && (
          <span className="mr-1 font-medium">{event.label}</span>
        )}
        {formatDisplayDate(event.date)}
        {event.place ? ` in ${event.place}` : ""}
        {event.details && Object.keys(event.details).length > 0 && (
          <p className="text-xs text-muted-foreground">
            {Object.entries(event.details)
              .map(([key, value]) => {
                const label = EVENT_DETAIL_FIELDS[event.eventType]?.find(
                  (field) => field.key === key,
                )?.label;
                return `${label ?? key}: ${value}`;
              })
              .join(" · ")}
          </p>
        )}
        {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Dialog isOpen={editOpen} onOpenChange={setEditOpen}>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit event</DialogTitle>
            </DialogHeader>
            <EventForm
              personId={personId}
              event={event}
              options={options}
              onDone={async () => {
                setEditOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
        <RemoveButton
          itemLabel={`this ${labelFor(options, "event_type", event.eventType)} event`}
          onConfirm={onRemove}
        />
      </div>
    </div>
  );
}

function EventForm({
  personId,
  event,
  options,
  onDone,
}: {
  personId: string;
  event: PersonEventRow | null;
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const addEventMutation = useMutation({ mutationFn: addEvent });
  const updateEventMutation = useMutation({ mutationFn: updateEvent });
  const initialEventType: EventType = event?.eventType ?? "residence";
  const initialDetails = event?.details ?? {};
  const [eventType, setEventType] = useState(initialEventType);
  const [details, setDetails] = useState<Record<string, string>>(initialDetails);

  const form = useForm({
    defaultValues: {
      label: event?.label ?? "",
      dateOriginal: event?.date?.original ?? "",
      place: event?.place ?? "",
      description: event?.description ?? "",
    },
    onSubmit: async ({ value }) => {
      const detailFields = EVENT_DETAIL_FIELDS[eventType] ?? [];
      const detailEntries = detailFields
        .map(({ key }) => [key, (details[key] ?? "").trim()] as const)
        .filter(([, fieldValue]) => fieldValue !== "");
      const payload = {
        eventType,
        label: value.label.trim() === "" ? null : value.label.trim(),
        date:
          value.dateOriginal.trim() === ""
            ? null
            : {
                original: value.dateOriginal.trim(),
                ...parseHistoricalDate(value.dateOriginal.trim()),
              },
        place: value.place.trim() === "" ? null : value.place,
        details: detailEntries.length > 0 ? Object.fromEntries(detailEntries) : null,
        description: value.description.trim() === "" ? null : value.description,
      };
      if (event) {
        await updateEventMutation.mutateAsync({ data: { id: event.id, ...payload } });
      } else {
        await addEventMutation.mutateAsync({ data: { personId, ...payload } });
      }
      await onDone();
    },
  });

  const formIsDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const label = useStore(form.store, (state) => state.values.label);
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
        onChange={(value) => {
          if (value) setEventType(eventTypeSchema.parse(value));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionsFor(options, "event_type").map((option) => (
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
      <form.Field name="dateOriginal">
        {(field) => (
          <HistoricalDateInput
            placeholder="Date, e.g. 1902 or abt 1902"
            value={field.state.value}
            onChange={field.handleChange}
            preview={historicalDatePreview(field.state.value)}
          />
        )}
      </form.Field>
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
      <form.Field name="description">
        {(field) => (
          <Input
            placeholder="Description"
            value={field.state.value}
            onChange={(inputEvent) => field.handleChange(inputEvent.target.value)}
          />
        )}
      </form.Field>
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting} isDisabled={needsLabel}>
          {event ? "Save" : "Add"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

type FactOption = {
  key: string;
  factType: CitationFactType;
  factId: string | null;
  label: string;
};

function CitationsSection({
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
  const removeCitationMutation = useMutation({ mutationFn: removeCitation });
  const [addOpen, setAddOpen] = useState(false);

  const remove = async (id: string) => {
    await removeCitationMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  const sourceById = new Map(sourcesList.map((source) => [source.id, source]));

  const factLabel = (citation: CitationRow): string => {
    switch (citation.factType) {
      case "person":
        return "This person";
      case "birth":
        return "Birth";
      case "death":
        return "Death";
      case "name": {
        const name = names.find((candidate) => candidate.id === citation.factId);
        return name
          ? `Alternate name: ${[name.given, name.surname].filter(Boolean).join(" ")}`
          : "Alternate name";
      }
      case "event": {
        const event = events.find((candidate) => candidate.id === citation.factId);
        return event
          ? `Event: ${labelFor(options, "event_type", event.eventType)}${event.label ? ` (${event.label})` : ""}`
          : "Event";
      }
      case "union": {
        const union = unions.find((candidate) => candidate.id === citation.factId);
        return union ? `Union (${labelFor(options, "union_status", union.status)})` : "Union";
      }
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Sources &amp; citations</CardTitle>
        <Dialog isOpen={addOpen} onOpenChange={setAddOpen}>
          <Button variant="outline" size="sm">
            + Add
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add citation</DialogTitle>
            </DialogHeader>
            <CitationForm
              personId={personId}
              sourcesList={sourcesList}
              names={names}
              events={events}
              unions={unions}
              options={options}
              onDone={async () => {
                setAddOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {citations.map((citation) => {
          const source = sourceById.get(citation.sourceId);
          return (
            <div key={citation.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <Badge variant="outline" className="mr-2">
                  {labelFor(options, "confidence", citation.confidence)}
                </Badge>
                <span className="font-medium">{source?.title ?? "Unknown source"}</span>
                <p className="text-xs text-muted-foreground">
                  {factLabel(citation)}
                  {citation.page ? ` · p. ${citation.page}` : ""}
                  {citation.note ? ` · ${citation.note}` : ""}
                </p>
              </div>
              <RemoveButton
                itemLabel={`this citation of "${source?.title ?? "this source"}"`}
                onConfirm={() => void remove(citation.id)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CitationForm({
  personId,
  sourcesList,
  names,
  events,
  unions,
  options,
  onDone,
}: {
  personId: string;
  sourcesList: SourceRow[];
  names: NameVariantRow[];
  events: PersonEventRow[];
  unions: UnionRow[];
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const createSourceMutation = useMutation({ mutationFn: createSource });
  const addCitationMutation = useMutation({ mutationFn: addCitation });

  const factOptions: FactOption[] = [
    { key: "person|none", factType: "person", factId: null, label: "This person (general)" },
    { key: "birth|none", factType: "birth", factId: null, label: "Birth" },
    { key: "death|none", factType: "death", factId: null, label: "Death" },
    ...names.map((name) => ({
      key: `name|${name.id}`,
      factType: "name" as const,
      factId: name.id,
      label: `Name: ${[name.given, name.surname].filter(Boolean).join(" ") || "unnamed"}`,
    })),
    ...events.map((event) => ({
      key: `event|${event.id}`,
      factType: "event" as const,
      factId: event.id,
      label: `Event: ${labelFor(options, "event_type", event.eventType)}${event.label ? ` (${event.label})` : ""}`,
    })),
    ...unions.map((union) => ({
      key: `union|${union.id}`,
      factType: "union" as const,
      factId: union.id,
      label: `Union (${labelFor(options, "union_status", union.status)})`,
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

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Select
        aria-label="What this cites"
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

      {sourceMode === "existing" ? (
        <div className="space-y-2">
          <Select
            aria-label="Source"
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
            + New source instead
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Source title"
            value={newSourceTitle}
            onChange={(inputEvent) => setNewSourceTitle(inputEvent.target.value)}
          />
          <Input
            placeholder="Author (optional)"
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
              Use an existing source instead
            </Button>
          )}
        </div>
      )}

      <Select
        aria-label="Confidence"
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
        placeholder="Page"
        value={page}
        onChange={(inputEvent) => setPage(inputEvent.target.value)}
      />
      <Input
        placeholder="Note"
        value={note}
        onChange={(inputEvent) => setNote(inputEvent.target.value)}
      />

      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={pending} isDisabled={!canSubmit}>
          Add
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
