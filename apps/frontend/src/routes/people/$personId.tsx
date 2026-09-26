import type { AppRouter } from "@genealogy/backend";
import {
  calculateAge,
  calculateResearchCompleteness,
  confidenceSchema,
  eventTypeSchema,
  formatFullPersonName,
  formatLifespan,
  formatPersonName,
  joinHistoricalDateText,
  nameVariantTypeSchema,
  parentageSchema,
  parseHistoricalDate,
  resolveHistoricalDate,
  sexSchema,
  splitHistoricalDateText,
  unionStatusSchema,
  type CitationFactType,
  type Confidence,
  type EventType,
  type HistoricalDate,
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
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@genealogy/ui/components/card";
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
  type HistoricalDateQuality,
} from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { ProgressBar } from "@genealogy/ui/components/progress-bar";
import { SaveButton } from "@genealogy/ui/components/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { Switch } from "@genealogy/ui/components/switch";
import { Tooltip, TooltipContent } from "@genealogy/ui/components/tooltip";
import { cn } from "@genealogy/ui/lib/utils";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { CameraIcon, Network, PencilIcon, PlusIcon, Trash2Icon, UnlinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { publicBackendUrl } from "../../lib/env";
import { formatDisplayDate } from "../../lib/format-date";
import {
  GenderIcon,
  initials,
  labelFor,
  optionsFor,
  RELATIONSHIP_TO_ROOT_LABELS,
  SEX_LABELS,
} from "../../lib/person-display";
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
  updateUnion,
} from "../../server/functions/person.functions";
import {
  addNote,
  listNotes,
  removeNote,
  updateNote,
} from "../../server/functions/research-note.functions";
import { listOptions } from "../../server/functions/settings.functions";
import {
  addCitation,
  createSource,
  listCitations,
  listSources,
  removeCitation,
} from "../../server/functions/source.functions";
import { PersonPhotosCard } from "./-immich-photos-card";

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
type ResearchNoteRow = RouterOutputs["researchNote"]["listNotes"][number];
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
  death: [
    { key: "causeOfDeath", label: "Cause of death" },
    { key: "informant", label: "Informant" },
  ],
};

/** Earliest-first sort key for the Life events timeline; undated entries sort last. */
function timelineSortValue(date: HistoricalDate | null): number {
  const iso = date?.earliest ?? date?.latest ?? null;
  return iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY;
}

/**
 * The single highest-ranked confidence option currently configured (by
 * `sortOrder`) — "top tier" for the Life events dot below, not a specific
 * confidence value, so the 3-state dot (top/cited/uncited) still works
 * whatever labels or how many levels Settings has configured.
 */
function topConfidenceKey(options: ConfigurableOptionRow[]): string | null {
  const confidenceOptions = optionsFor(options, "confidence");
  if (confidenceOptions.length === 0) return null;
  return confidenceOptions.reduce((top, option) =>
    option.sortOrder > top.sortOrder ? option : top,
  ).key;
}

type ConfidenceTier = "top" | "cited" | "none";

function confidenceTier(
  citations: CitationRow[],
  factType: CitationFactType,
  factId: string,
  topKey: string | null,
): ConfidenceTier {
  const matches = citations.filter(
    (citation) => citation.factType === factType && citation.factId === factId,
  );
  if (matches.length === 0) return "none";
  if (topKey !== null && matches.some((citation) => citation.confidence === topKey)) return "top";
  return "cited";
}

function ConfidenceDot({ tier, className }: { tier: ConfidenceTier; className?: string }) {
  if (tier === "top") {
    return (
      <span className={cn("size-2.5 rounded-full bg-primary", className)} aria-hidden="true" />
    );
  }
  if (tier === "cited") {
    return (
      <span className={cn("size-2.5 rounded-full bg-amber-500", className)} aria-hidden="true" />
    );
  }
  return (
    <span
      className={cn(
        "size-2.5 rounded-full border-2 border-muted-foreground/50 bg-background",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/**
 * Age at `at` relative to `birth` — in weeks under a year old, whole years
 * after, matching how genealogists usually write an infant's age (see the
 * Life events mockup). Null when either date can't be resolved to a real
 * day, or `at` is on/before `birth` (the birth event itself has no
 * meaningful age to show).
 */
function formatEventAge(
  birth: HistoricalDate | null | undefined,
  at: HistoricalDate | null | undefined,
): string | null {
  const bornIso = birth?.earliest ?? birth?.latest ?? null;
  const atIso = at?.earliest ?? at?.latest ?? null;
  if (!bornIso || !atIso) return null;
  const born = new Date(bornIso);
  const eventDate = new Date(atIso);
  const diffDays = Math.round((eventDate.getTime() - born.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return null;
  if (diffDays < 365) {
    const weeks = Math.max(1, Math.round(diffDays / 7));
    return `age ${weeks} wk${weeks === 1 ? "" : "s"}`;
  }
  let age = eventDate.getUTCFullYear() - born.getUTCFullYear();
  const hadBirthday =
    eventDate.getUTCMonth() > born.getUTCMonth() ||
    (eventDate.getUTCMonth() === born.getUTCMonth() && eventDate.getUTCDate() >= born.getUTCDate());
  if (!hadBirthday) age -= 1;
  return `age ${age}`;
}

/** "Son of X and Y" — sex-aware, and only for a birth event; derived from the existing Parents card data, not a new field. */
function parentageLine(sex: Sex, parents: { given: string; surname: string }[]): string | null {
  if (parents.length === 0) return null;
  const noun = sex === "M" ? "Son" : sex === "F" ? "Daughter" : "Child";
  return `${noun} of ${parents.map((parent) => formatPersonName(parent)).join(" and ")}`;
}

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
  const researchNotesList = useQuery({
    queryKey: ["researchNote", "listNotes", personId],
    queryFn: () => listNotes({ data: { personId } }),
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
      queryClient.invalidateQueries({ queryKey: ["researchNote", "listNotes", personId] }),
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
  const nicknames = (names.data ?? [])
    .filter((name) => name.nameType === "nickname")
    .map((name) => name.given);
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
      <div className="flex items-center justify-between gap-4">
        <nav
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link to="/people" className="hover:text-foreground">
            People
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">
            {formatFullPersonName({ ...person.data, nickname: nicknames })}
          </span>
        </nav>
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
        nicknames={nicknames}
        names={names.data ?? []}
        options={options.data ?? []}
        citations={citationsList.data ?? []}
        sourcesList={sourcesList.data ?? []}
        hasParent={parents.length > 0}
        onChanged={refresh}
        canDelete={canDelete}
        onDeleted={() => navigate({ to: "/people" })}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
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
          <PersonPhotosCard personId={personId} />
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
          <ResearchNotesSection
            personId={personId}
            notes={researchNotesList.data ?? []}
            options={options.data ?? []}
            onChanged={refresh}
          />
        </div>
        <LifeEventsCard
          personId={personId}
          events={events.data ?? []}
          unions={unions.data ?? []}
          spouses={spouses}
          parents={parents}
          person={person.data}
          citations={citationsList.data ?? []}
          sourcesList={sourcesList.data ?? []}
          options={options.data ?? []}
          onChanged={refresh}
        />
      </div>
    </div>
  );
}

function PersonFields({
  person,
  nicknames,
  names,
  options,
  citations,
  sourcesList,
  hasParent,
  onChanged,
  canDelete,
  onDeleted,
}: {
  person: PersonRow;
  nicknames: string[];
  names: NameVariantRow[];
  options: ConfigurableOptionRow[];
  citations: CitationRow[];
  sourcesList: SourceRow[];
  hasParent: boolean;
  onChanged: () => Promise<void>;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const [addEventOpen, setAddEventOpen] = useState(false);
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

  const birthSplit = splitHistoricalDateText(person.birth?.original ?? "");
  const deathSplit = splitHistoricalDateText(person.death?.original ?? "");
  const burialSplit = splitHistoricalDateText(person.burial?.original ?? "");

  const form = useForm({
    defaultValues: {
      given: person.given,
      surname: person.surname,
      sex: person.sex,
      titlePrefix: person.titlePrefix ?? "",
      suffix: person.suffix ?? "",
      birthQuality: birthSplit.quality,
      birthValue: birthSplit.value,
      birthEndValue: birthSplit.endValue,
      birthPlace: person.birthPlace ?? "",
      deathQuality: deathSplit.quality,
      deathValue: deathSplit.value,
      deathEndValue: deathSplit.endValue,
      deathPlace: person.deathPlace ?? "",
      causeOfDeath: person.causeOfDeath ?? "",
      burialQuality: burialSplit.quality,
      burialValue: burialSplit.value,
      burialEndValue: burialSplit.endValue,
      burialPlace: person.burialPlace ?? "",
      notes: person.notes ?? "",
      isLiving: person.isLiving,
    },
    onSubmit: async ({ value, formApi }) => {
      const birthOriginal = joinHistoricalDateText({
        quality: value.birthQuality,
        value: value.birthValue,
        endValue: value.birthEndValue,
      });
      const deathOriginal = joinHistoricalDateText({
        quality: value.deathQuality,
        value: value.deathValue,
        endValue: value.deathEndValue,
      });
      const burialOriginal = joinHistoricalDateText({
        quality: value.burialQuality,
        value: value.burialValue,
        endValue: value.burialEndValue,
      });
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
            birthOriginal === null
              ? null
              : { original: birthOriginal, ...parseHistoricalDate(birthOriginal) },
          birthPlace: value.birthPlace.trim() === "" ? null : value.birthPlace,
          death:
            deathOriginal === null
              ? null
              : { original: deathOriginal, ...parseHistoricalDate(deathOriginal) },
          deathPlace: value.deathPlace.trim() === "" ? null : value.deathPlace,
          causeOfDeath: value.causeOfDeath.trim() === "" ? null : value.causeOfDeath,
          burial:
            burialOriginal === null
              ? null
              : { original: burialOriginal, ...parseHistoricalDate(burialOriginal) },
          burialPlace: value.burialPlace.trim() === "" ? null : value.burialPlace,
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
  const birthQuality = useStore(form.store, (state) => state.values.birthQuality);
  const birthValue = useStore(form.store, (state) => state.values.birthValue);
  const birthEndValue = useStore(form.store, (state) => state.values.birthEndValue);
  const deathQuality = useStore(form.store, (state) => state.values.deathQuality);
  const deathValue = useStore(form.store, (state) => state.values.deathValue);
  const deathEndValue = useStore(form.store, (state) => state.values.deathEndValue);
  const burialQuality = useStore(form.store, (state) => state.values.burialQuality);
  const burialValue = useStore(form.store, (state) => state.values.burialValue);
  const burialEndValue = useStore(form.store, (state) => state.values.burialEndValue);

  const age = calculateAge(person);
  const birthDisplay = formatDisplayDate(person.birth);
  const deathDisplay = formatDisplayDate(person.death);

  // The page header's birth/death line — date *and* place together
  // ("b. 14 March 1838 · Give Sogn, Vejle Amt").
  const birthSummary = [birthDisplay, person.birthPlace].filter(Boolean).join(" · ") || null;
  const deathSummary = person.isLiving
    ? null
    : [deathDisplay, person.deathPlace].filter(Boolean).join(" · ") || null;

  // The first alternate name (any type but the primary "birth" one), with
  // its earliest citation's source title in parens if it has one — mirrors
  // the mockup's single "Also known as" line.
  const akaName = names.find((name) => name.nameType !== "birth");
  const akaCitation = akaName
    ? citations.find((citation) => citation.factType === "name" && citation.factId === akaName.id)
    : undefined;
  const akaSource = akaCitation
    ? sourcesList.find((source) => source.id === akaCitation.sourceId)
    : undefined;

  const completeness = calculateResearchCompleteness({
    hasBirthDate: person.birth?.earliest != null || person.birth?.latest != null,
    hasDeathDateOrLiving:
      person.isLiving || person.death?.earliest != null || person.death?.latest != null,
    hasParent,
    hasCitation: citations.length > 0,
    hasPhoto: person.photoPath != null,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <PersonPhoto person={person} onChanged={onChanged} size="lg" />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <CopyableText value={person.publicId} className="font-mono text-foreground" />
                </Badge>
                <Badge variant="outline">{SEX_LABELS[person.sex]}</Badge>
                {person.relationshipToRoot && (
                  <Badge className="border-transparent bg-primary/10 text-primary">
                    {RELATIONSHIP_TO_ROOT_LABELS[person.relationshipToRoot]}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                {formatFullPersonName({ ...person, nickname: nicknames })}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {birthSummary && (
                  <span>
                    <span className="font-medium text-foreground">b.</span> {birthSummary}
                    {person.isLiving && age !== null ? ` · Age ${age}` : ""}
                  </span>
                )}
                {!person.isLiving && (
                  <span>
                    <span className="font-medium text-foreground">d.</span> {deathSummary ?? "—"}
                    {age !== null ? ` · Age ${age}` : ""}
                  </span>
                )}
              </div>
              {akaName && (
                <p className="text-sm text-muted-foreground">
                  Also known as:{" "}
                  <span className="text-foreground">{formatPersonName(akaName)}</span>
                  {akaSource ? ` (${akaSource.title})` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:w-56 sm:items-end">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Link
                to="/tree"
                search={{ personId: person.id }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Network className="size-4" /> View in tree
              </Link>
              <Dialog isOpen={addEventOpen} onOpenChange={setAddEventOpen}>
                <Button size="sm">
                  <PlusIcon className="size-4" /> Add event
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add event</DialogTitle>
                  </DialogHeader>
                  <EventForm
                    personId={person.id}
                    event={null}
                    citations={citations}
                    sourcesList={sourcesList}
                    options={options}
                    onDone={async () => {
                      setAddEventOpen(false);
                      await onChanged();
                    }}
                    onChanged={onChanged}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <ProgressBar label="Research completeness" value={completeness} />
          </div>
        </CardContent>
      </Card>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          // TanStack Form rethrows onSubmit's rejection after resetting
          // isSubmitting — caught here only to avoid an unhandled rejection;
          // the failure itself is surfaced via update.isError below.
          void form.handleSubmit().catch(() => {});
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Names &amp; gender</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <form.Field name="sex">
                {(field) => (
                  <LabeledField label="Gender">
                    <ButtonRadioGroup
                      aria-label="Gender"
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                      options={sexSchema.options.map((option) => ({
                        value: option,
                        label: SEX_LABELS[option],
                      }))}
                    />
                  </LabeledField>
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
            <form.Field name="notes">
              {(field) => (
                <LabeledField label="Notes" className="sm:col-span-2" asDiv>
                  <MarkdownEditor
                    aria-label="Notes"
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                </LabeledField>
              )}
            </form.Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Birth</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LabeledField label="Date of Birth">
              <HistoricalDateInput
                placeholder="e.g. 1854"
                quality={birthQuality}
                onQualityChange={(quality) => form.setFieldValue("birthQuality", quality)}
                value={birthValue}
                onChange={(value) => form.setFieldValue("birthValue", value)}
                endValue={birthEndValue}
                onEndChange={(value) => form.setFieldValue("birthEndValue", value)}
                preview={historicalDateFieldPreview(birthQuality, birthValue, birthEndValue)}
              />
            </LabeledField>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Living status &amp; death</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <form.Field name="isLiving">
                {(field) => (
                  <LabeledField label="Is this person living?">
                    <ButtonRadioGroup
                      aria-label="Is this person living?"
                      value={field.state.value ? "living" : "deceased"}
                      onChange={(value) => field.handleChange(value === "living")}
                      options={[
                        { value: "living", label: "Living" },
                        { value: "deceased", label: "Deceased" },
                      ]}
                    />
                  </LabeledField>
                )}
              </form.Field>
            </div>
            {!isLiving && (
              <>
                <LabeledField label="Date of Death">
                  <HistoricalDateInput
                    placeholder="e.g. 12 MAR 1901"
                    quality={deathQuality}
                    onQualityChange={(quality) => form.setFieldValue("deathQuality", quality)}
                    value={deathValue}
                    onChange={(value) => form.setFieldValue("deathValue", value)}
                    endValue={deathEndValue}
                    onEndChange={(value) => form.setFieldValue("deathEndValue", value)}
                    preview={historicalDateFieldPreview(deathQuality, deathValue, deathEndValue)}
                  />
                </LabeledField>
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
                <LabeledField label="Burial date">
                  <HistoricalDateInput
                    placeholder="e.g. c. Nov 1901"
                    quality={burialQuality}
                    onQualityChange={(quality) => form.setFieldValue("burialQuality", quality)}
                    value={burialValue}
                    onChange={(value) => form.setFieldValue("burialValue", value)}
                    endValue={burialEndValue}
                    onEndChange={(value) => form.setFieldValue("burialEndValue", value)}
                    preview={historicalDateFieldPreview(burialQuality, burialValue, burialEndValue)}
                  />
                </LabeledField>
                <form.Field name="burialPlace">
                  {(field) => (
                    <LabeledField label="Burial place">
                      <Input
                        placeholder="Cemetery or churchyard"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </LabeledField>
                  )}
                </form.Field>
                <form.Field name="causeOfDeath">
                  {(field) => (
                    <LabeledField label="Cause of death" className="sm:col-span-2">
                      <Input
                        placeholder="As written in the record, e.g. Alderdomssvaghed"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </LabeledField>
                  )}
                </form.Field>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SaveButton isDirty={isDirty} isPending={isSubmitting}>
              Save
            </SaveButton>
            <Button type="button" variant="outline" onPress={() => form.reset()}>
              Cancel
            </Button>
          </div>
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
          <p className="text-sm text-destructive">{updatePersonMutation.error.message}</p>
        )}
        {removePersonMutation.isError && (
          <p className="text-sm text-destructive">{removePersonMutation.error.message}</p>
        )}
      </form>
    </div>
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
 * Same as `historicalDatePreview`, but from a quality dropdown's split parts
 * rather than the raw assembled string — every `HistoricalDateInput` call
 * site holds its date this way now, so this is the one they all preview from.
 */
function historicalDateFieldPreview(
  quality: HistoricalDateQuality,
  value: string,
  endValue: string,
): HistoricalDatePreview | null {
  return historicalDatePreview(joinHistoricalDateText({ quality, value, endValue }) ?? "");
}

/**
 * Upload/delete go through this app's own /api/people/$id/photo proxy route
 * (same-origin, cookies ride along automatically) — see
 * routes/api/people/$id/photo.ts. The `<img>` read below still points
 * directly at apps/backend: it's an unauthenticated static file, and a plain
 * `<img src>` isn't subject to CORS regardless, so proxying it would add
 * nothing. See `publicBackendUrl`'s doc comment in lib/env.ts.
 */
function PersonPhoto({
  person,
  onChanged,
  size = "sm",
}: {
  person: PersonRow;
  onChanged: () => Promise<void>;
  /** "lg" is the large, rounded-square avatar on the view-mode header. */
  size?: "sm" | "lg";
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;
  const dimensionClass = size === "lg" ? "size-24" : "size-16";
  const roundingClass = size === "lg" ? "rounded-xl" : "rounded-full";

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
        className={cn("group relative p-0", dimensionClass, roundingClass)}
        isDisabled={uploading}
        onPress={() => fileInputRef.current?.click()}
        aria-label={photoUrl ? "Change photo" : "Upload photo"}
      >
        <Avatar className={cn(dimensionClass, roundingClass)}>
          {photoUrl && <AvatarImage src={photoUrl} alt={formatPersonName(person)} />}
          <AvatarFallback className={size === "lg" ? "text-2xl" : "text-base"}>
            {initials(person)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-data-hovered:opacity-100",
            roundingClass,
          )}
        >
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
        <Button type="button" variant="ghost" size="sm">
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
  /**
   * A plain `<label>` forwards a click anywhere inside it (that isn't
   * itself a labelable element) to the *first* labelable descendant —
   * fine when that's the one input/select this wraps, wrong when the
   * child is a widget with its own internal buttons that happen to come
   * first in the DOM (MarkdownEditor's toolbar). Set this for a child
   * that already carries its own `aria-label` and renders a plain `<div>`
   * instead, so text-area clicks stop silently also clicking "Undo".
   */
  asDiv = false,
  children,
}: {
  label: string;
  className?: string;
  asDiv?: boolean;
  children: ReactNode;
}) {
  const Tag = asDiv ? "div" : "label";
  return (
    <Tag className={`block space-y-1 text-sm ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Tag>
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
          if (kind === "spouse") {
            return (
              <SpouseRow
                key={relative.id}
                relative={relative}
                union={union}
                options={options}
                onChanged={onChanged}
                onRemove={() => void remove(relative.id)}
              />
            );
          }
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
              </div>
              <RemoveButton
                itemLabel={`the relationship with ${formatPersonName(relative)}`}
                onConfirm={() => void remove(relative.id)}
                trigger={
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove child">
                    <UnlinkIcon className="size-4" />
                  </Button>
                }
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

/**
 * A linked spouse always has a union behind it — `AddRelative`'s `link()`
 * always creates one alongside the `SPOUSE_OF` edge — so `union` here is
 * only possibly missing if the two have drifted, not in normal use.
 */
function SpouseRow({
  relative,
  union,
  options,
  onChanged,
  onRemove,
}: {
  relative: PersonRow;
  union: UnionRow | undefined;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
  onRemove: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div>
        <Link to="/people/$personId" params={{ personId: relative.id }} className="hover:underline">
          {formatPersonName(relative)}
          {formatLifespan(relative) && (
            <span className="ml-1 text-muted-foreground">({formatLifespan(relative)})</span>
          )}
        </Link>
        {union && (
          <p className="text-xs text-muted-foreground">
            {labelFor(options, "union_status", union.status)}
            {union.startDate ? ` · ${formatDisplayDate(union.startDate)}` : ""}
          </p>
        )}
        {union?.notes && (
          <MarkdownContent className="text-xs text-muted-foreground">{union.notes}</MarkdownContent>
        )}
      </div>
      <div className="flex items-center gap-1">
        {union && (
          <Dialog isOpen={editOpen} onOpenChange={setEditOpen}>
            <Button type="button" variant="ghost" size="icon" aria-label="Edit union">
              <PencilIcon className="size-4" />
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit union</DialogTitle>
              </DialogHeader>
              <UnionForm
                union={union}
                options={options}
                onDone={async () => {
                  setEditOpen(false);
                  await onChanged();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
        <RemoveButton
          itemLabel={`the relationship with ${formatPersonName(relative)}`}
          onConfirm={onRemove}
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label="Remove spouse">
              <UnlinkIcon className="size-4" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** Edits an existing union's own facts — status, start date/place — the same fields `AddRelative` sets when creating one. */
function UnionForm({
  union,
  options,
  onDone,
}: {
  union: UnionRow;
  options: ConfigurableOptionRow[];
  onDone: () => Promise<void>;
}) {
  const updateUnionMutation = useMutation({ mutationFn: updateUnion });
  const [status, setStatus] = useState<UnionStatus>(unionStatusSchema.parse(union.status));

  const startSplit = splitHistoricalDateText(union.startDate?.original ?? "");

  const form = useForm({
    defaultValues: {
      startQuality: startSplit.quality,
      startValue: startSplit.value,
      startEndValue: startSplit.endValue,
      startPlace: union.startPlace ?? "",
      notes: union.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      const startDate = joinHistoricalDateText({
        quality: value.startQuality,
        value: value.startValue,
        endValue: value.startEndValue,
      });
      await updateUnionMutation.mutateAsync({
        data: {
          id: union.id,
          status,
          startDate:
            startDate === null ? null : { original: startDate, ...parseHistoricalDate(startDate) },
          startPlace: value.startPlace.trim() === "" ? null : value.startPlace,
          notes: value.notes.trim() === "" ? null : value.notes,
        },
      });
      await onDone();
    },
  });

  const formIsDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const startQuality = useStore(form.store, (state) => state.values.startQuality);
  const startValue = useStore(form.store, (state) => state.values.startValue);
  const startEndValue = useStore(form.store, (state) => state.values.startEndValue);
  // status is tracked outside the form (it drives a Select, not a
  // form.Field), so the form's own isDirty misses a status-only change.
  const isDirty = formIsDirty || status !== union.status;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Select
        aria-label="Union status"
        value={status}
        onChange={(value) => {
          if (value) setStatus(unionStatusSchema.parse(value));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionsFor(options, "union_status").map((option) => (
            <SelectItem key={option.key} id={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <HistoricalDateInput
        placeholder="Marriage date, e.g. 12 JUN 1920"
        quality={startQuality}
        onQualityChange={(quality) => form.setFieldValue("startQuality", quality)}
        value={startValue}
        onChange={(value) => form.setFieldValue("startValue", value)}
        endValue={startEndValue}
        onEndChange={(value) => form.setFieldValue("startEndValue", value)}
        preview={historicalDateFieldPreview(startQuality, startValue, startEndValue)}
      />
      <form.Field name="startPlace">
        {(field) => (
          <Input
            placeholder="Marriage place"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
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
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          Save
        </SaveButton>
      </DialogFooter>
    </form>
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
  const [unionQuality, setUnionQuality] = useState<HistoricalDateQuality>("exact");
  const [unionValue, setUnionValue] = useState("");
  const [unionEndValue, setUnionEndValue] = useState("");
  const [unionPlace, setUnionPlace] = useState("");
  const [unionNotes, setUnionNotes] = useState("");

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

  const unionOriginal = joinHistoricalDateText({
    quality: unionQuality,
    value: unionValue,
    endValue: unionEndValue,
  });

  const link = async (target: PersonRow) => {
    if (kind === "spouse") {
      await addUnionMutation.mutateAsync({
        data: {
          personAId: personId,
          personBId: target.id,
          status: unionStatus,
          startDate:
            unionOriginal === null
              ? null
              : { original: unionOriginal, ...parseHistoricalDate(unionOriginal) },
          startPlace: unionPlace.trim() === "" ? null : unionPlace,
          notes: unionNotes.trim() === "" ? null : unionNotes,
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
      <Tooltip>
        <Button
          variant="outline"
          size="icon"
          aria-label={kind === "spouse" ? "Add spouse" : "Add child"}
        >
          <PlusIcon className="size-4" />
        </Button>
        <TooltipContent>{kind === "spouse" ? "Add spouse" : "Add child"}</TooltipContent>
      </Tooltip>
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
                placeholder="Date, e.g. 12 JUN 1920"
                quality={unionQuality}
                onQualityChange={setUnionQuality}
                value={unionValue}
                onChange={setUnionValue}
                endValue={unionEndValue}
                onEndChange={setUnionEndValue}
                preview={historicalDateFieldPreview(unionQuality, unionValue, unionEndValue)}
              />
              <Input
                placeholder="Place"
                value={unionPlace}
                onChange={(event) => setUnionPlace(event.target.value)}
              />
              <MarkdownEditor
                aria-label="Notes"
                placeholder="Notes"
                value={unionNotes}
                onChange={setUnionNotes}
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
                unionOriginal={unionOriginal}
                unionPlace={unionPlace}
                unionNotes={unionNotes}
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
  unionOriginal,
  unionPlace,
  unionNotes,
  onDone,
}: {
  kind: RelativeKind;
  personId: string;
  parentage: Parentage;
  unionStatus: UnionStatus;
  unionOriginal: string | null;
  unionPlace: string;
  unionNotes: string;
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
              unionOriginal === null
                ? null
                : { original: unionOriginal, ...parseHistoricalDate(unionOriginal) },
            startPlace: unionPlace.trim() === "" ? null : unionPlace,
            notes: unionNotes.trim() === "" ? null : unionNotes,
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
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Parents</CardTitle>
        <AddOtherParent
          personId={personId}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
        />
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
        <div className="space-y-2">
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
                trigger={
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove parent">
                    <UnlinkIcon className="size-4" />
                  </Button>
                }
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
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label}`}>
            <UnlinkIcon className="size-4" />
          </Button>
        }
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
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open && mode === "search",
  });

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const options = (search.data?.items ?? []).filter((candidate) => !excludeIds.has(candidate.id));

  const link = async (target: PersonRow) => {
    await linkParentMutation.mutateAsync({
      data: { parentId: target.id, childId: personId, parentage: "birth" },
    });
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
      <Button variant="outline" size="sm" className="w-full justify-start">
        + Add {label.toLowerCase()}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {label.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "search" ? (
            <>
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
              <CreateAndLinkParentForm
                personId={personId}
                parentage="birth"
                presetSex={presetSex}
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
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [parentage, setParentage] = useState<Parentage>("unknown");

  const trimmedQuery = query.trim();
  const searchInput = { limit: 10, offset: 0, search: trimmedQuery === "" ? null : trimmedQuery };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    enabled: open && mode === "search",
  });

  const linkParentMutation = useMutation({ mutationFn: linkParent });
  const options = (search.data?.items ?? []).filter((candidate) => !excludeIds.has(candidate.id));

  const link = async (target: PersonRow) => {
    await linkParentMutation.mutateAsync({
      data: { parentId: target.id, childId: personId, parentage },
    });
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
      <Tooltip>
        <Button variant="outline" size="icon" aria-label="Add other parent">
          <PlusIcon className="size-4" />
        </Button>
        <TooltipContent>Add other parent</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add other parent</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
              <CreateAndLinkParentForm
                personId={personId}
                parentage={parentage}
                presetSex={null}
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
        {name.notes && (
          <MarkdownContent className="text-xs text-muted-foreground">{name.notes}</MarkdownContent>
        )}
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

  const sinceSplit = splitHistoricalDateText(name?.since?.original ?? "");

  const form = useForm({
    defaultValues: {
      given: name?.given ?? "",
      surname: name?.surname ?? "",
      sinceQuality: sinceSplit.quality,
      sinceValue: sinceSplit.value,
      sinceEndValue: sinceSplit.endValue,
      notes: name?.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      const sinceOriginal = joinHistoricalDateText({
        quality: value.sinceQuality,
        value: value.sinceValue,
        endValue: value.sinceEndValue,
      });
      const payload = {
        nameType,
        given: value.given,
        surname: value.surname,
        since:
          sinceOriginal === null
            ? null
            : { original: sinceOriginal, ...parseHistoricalDate(sinceOriginal) },
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
  const sinceQuality = useStore(form.store, (state) => state.values.sinceQuality);
  const sinceValue = useStore(form.store, (state) => state.values.sinceValue);
  const sinceEndValue = useStore(form.store, (state) => state.values.sinceEndValue);
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
      <HistoricalDateInput
        placeholder="Since, e.g. 12 JUN 1998"
        quality={sinceQuality}
        onQualityChange={(quality) => form.setFieldValue("sinceQuality", quality)}
        value={sinceValue}
        onChange={(value) => form.setFieldValue("sinceValue", value)}
        endValue={sinceEndValue}
        onEndChange={(value) => form.setFieldValue("sinceEndValue", value)}
        preview={historicalDateFieldPreview(sinceQuality, sinceValue, sinceEndValue)}
      />
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
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting}>
          {name ? "Save" : "Add"}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

/**
 * "birth"/"death" are ordinary `person_events` rows (see `PersonService`),
 * but the person form above owns creating them (as a dedicated pair of
 * fields) so there's only ever one canonical one of each — the generic
 * "+ Add event" dialog excludes them from its type choices accordingly. An
 * existing birth/death row is still fully editable from this list like any
 * other event (date, place, and now-relevant detail like cause of death),
 * except its type can't be changed away from what created it.
 */
const VITAL_EVENT_TYPES = new Set(["birth", "death"]);

type TimelineEntry =
  | { kind: "event"; date: HistoricalDate | null; event: PersonEventRow }
  | { kind: "union"; date: HistoricalDate | null; union: UnionRow };

/**
 * A single vertical timeline merging birth/baptism/census/etc. (`personEvents`)
 * with marriages (`unions`, which live in their own table/card — see "Spouses"
 * above) into one date-ordered read history. Marriages show read-only here;
 * editing one still happens from the Spouses card, which already owns that
 * union's full lifecycle (status, dates, removal) — duplicating that here
 * would be a second, easy-to-desync place to change the same record.
 */
function LifeEventsCard({
  personId,
  events,
  unions,
  spouses,
  parents,
  person,
  citations,
  sourcesList,
  options,
  onChanged,
}: {
  personId: string;
  events: PersonEventRow[];
  unions: UnionRow[];
  spouses: PersonRow[];
  parents: ParentRow[];
  person: PersonRow;
  citations: CitationRow[];
  sourcesList: SourceRow[];
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const removeEventMutation = useMutation({ mutationFn: removeEvent });
  const [addOpen, setAddOpen] = useState(false);
  const topKey = topConfidenceKey(options);

  const removeEventById = async (id: string) => {
    await removeEventMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  const spouseName = (union: UnionRow): string => {
    const otherId = union.personAId === personId ? union.personBId : union.personAId;
    const spouse = spouses.find((candidate) => candidate.id === otherId);
    return spouse ? formatPersonName(spouse) : "Unknown";
  };

  const entries: TimelineEntry[] = [
    ...events.map((event) => ({ kind: "event" as const, date: event.date, event })),
    ...unions
      .filter((union) => union.personAId === personId || union.personBId === personId)
      .map((union) => ({ kind: "union" as const, date: union.startDate, union })),
  ].toSorted((a, b) => timelineSortValue(a.date) - timelineSortValue(b.date));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Life events</CardTitle>
        <Dialog isOpen={addOpen} onOpenChange={setAddOpen}>
          <Tooltip>
            <Button variant="outline" size="icon" aria-label="Add event">
              <PlusIcon className="size-4" />
            </Button>
            <TooltipContent>Add event</TooltipContent>
          </Tooltip>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add event</DialogTitle>
            </DialogHeader>
            <EventForm
              personId={personId}
              event={null}
              citations={citations}
              sourcesList={sourcesList}
              options={options}
              onDone={async () => {
                setAddOpen(false);
                await onChanged();
              }}
              onChanged={onChanged}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ConfidenceDot tier="top" /> Primary source
          </span>
          <span className="flex items-center gap-1.5">
            <ConfidenceDot tier="cited" /> Secondary
          </span>
          <span className="flex items-center gap-1.5">
            <ConfidenceDot tier="none" /> Unsourced
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No life events recorded yet.</p>
        ) : (
          <div className="relative space-y-5">
            <div
              className="absolute top-1.5 bottom-1.5 left-23 w-px bg-border"
              aria-hidden="true"
            />
            {entries.map((entry) =>
              entry.kind === "event" ? (
                <EventTimelineRow
                  key={entry.event.id}
                  personId={personId}
                  event={entry.event}
                  personBirth={person.birth}
                  parents={parents}
                  personSex={person.sex}
                  citations={citations}
                  sourcesList={sourcesList}
                  options={options}
                  topKey={topKey}
                  onChanged={onChanged}
                  onRemove={() => void removeEventById(entry.event.id)}
                />
              ) : (
                <UnionTimelineRow
                  key={entry.union.id}
                  union={entry.union}
                  spouseName={spouseName(entry.union)}
                  personBirth={person.birth}
                  citations={citations}
                  options={options}
                  topKey={topKey}
                />
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The date/age pair on the left of a timeline row, and the dot marking its spot on the rail. */
function TimelineLead({
  date,
  age,
  tier,
}: {
  date: string | null;
  age: string | null;
  tier: ConfidenceTier;
}) {
  return (
    <>
      <div className="text-xs">
        <p className="font-semibold text-foreground">{date ?? "—"}</p>
        <p className="text-muted-foreground">{age ?? "—"}</p>
      </div>
      <div className="mt-0.5 flex justify-center">
        <ConfidenceDot tier={tier} className="relative z-10" />
      </div>
    </>
  );
}

function EventTimelineRow({
  personId,
  event,
  personBirth,
  parents,
  personSex,
  citations,
  sourcesList,
  options,
  topKey,
  onChanged,
  onRemove,
}: {
  personId: string;
  event: PersonEventRow;
  personBirth: HistoricalDate | null;
  parents: ParentRow[];
  personSex: Sex;
  citations: CitationRow[];
  sourcesList: SourceRow[];
  options: ConfigurableOptionRow[];
  topKey: string | null;
  onChanged: () => Promise<void>;
  onRemove: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const eventCitations = citations.filter(
    (citation) => citation.factType === "event" && citation.factId === event.id,
  );
  const tier = confidenceTier(citations, "event", event.id, topKey);
  const age = event.eventType === "birth" ? null : formatEventAge(personBirth, event.date);
  const detailLine = [
    event.eventType === "birth" ? parentageLine(personSex, parents) : null,
    event.details && Object.keys(event.details).length > 0
      ? Object.entries(event.details)
          .map(([key, value]) => {
            const label = EVENT_DETAIL_FIELDS[event.eventType]?.find(
              (field) => field.key === key,
            )?.label;
            return `${label ?? key}: ${value}`;
          })
          .join(" · ")
      : null,
  ].filter((line): line is string => line !== null);

  return (
    <div className="group grid grid-cols-[80px_16px_1fr_auto] items-start gap-x-3 text-sm">
      <TimelineLead date={formatDisplayDate(event.date)} age={age} tier={tier} />
      <div className="min-w-0">
        <p className="font-medium">
          {event.eventType === "other" && event.label
            ? event.label
            : labelFor(options, "event_type", event.eventType)}
        </p>
        {event.place && <p className="text-muted-foreground">{event.place}</p>}
        {detailLine.map((line) => (
          <p key={line} className="text-xs text-muted-foreground">
            {line}
          </p>
        ))}
        {event.notes && (
          <MarkdownContent className="text-xs text-muted-foreground">{event.notes}</MarkdownContent>
        )}
        <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Dialog isOpen={editOpen} onOpenChange={setEditOpen}>
            <Button type="button" variant="ghost" size="sm">
              Edit
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit event</DialogTitle>
              </DialogHeader>
              <EventForm
                personId={personId}
                event={event}
                citations={citations}
                sourcesList={sourcesList}
                options={options}
                onDone={async () => {
                  setEditOpen(false);
                  await onChanged();
                }}
                onChanged={onChanged}
              />
            </DialogContent>
          </Dialog>
          <RemoveButton
            itemLabel={`this ${labelFor(options, "event_type", event.eventType)} event`}
            onConfirm={onRemove}
          />
        </div>
      </div>
      <Badge variant="outline" className="shrink-0 whitespace-nowrap">
        {eventCitations.length === 0
          ? "Unsourced"
          : `${eventCitations.length} ${eventCitations.length === 1 ? "source" : "sources"}`}
      </Badge>
    </div>
  );
}

/** Read-only — see the comment on `LifeEventsCard` for why editing a union stays in the Spouses card rather than being duplicated here. */
function UnionTimelineRow({
  union,
  spouseName,
  personBirth,
  citations,
  options,
  topKey,
}: {
  union: UnionRow;
  spouseName: string;
  personBirth: HistoricalDate | null;
  citations: CitationRow[];
  options: ConfigurableOptionRow[];
  topKey: string | null;
}) {
  const unionCitations = citations.filter(
    (citation) => citation.factType === "union" && citation.factId === union.id,
  );
  const tier = confidenceTier(citations, "union", union.id, topKey);
  const age = formatEventAge(personBirth, union.startDate);
  const title =
    union.status === "married" ? "Marriage" : labelFor(options, "union_status", union.status);

  return (
    <div className="grid grid-cols-[80px_16px_1fr_auto] items-start gap-x-3 text-sm">
      <TimelineLead date={formatDisplayDate(union.startDate)} age={age} tier={tier} />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {union.startPlace && <p className="text-muted-foreground">{union.startPlace}</p>}
        <p className="text-xs text-muted-foreground">to {spouseName}</p>
        {union.notes && (
          <MarkdownContent className="text-xs text-muted-foreground">{union.notes}</MarkdownContent>
        )}
      </div>
      <Badge variant="outline" className="shrink-0 whitespace-nowrap">
        {unionCitations.length === 0
          ? "Unsourced"
          : `${unionCitations.length} ${unionCitations.length === 1 ? "source" : "sources"}`}
      </Badge>
    </div>
  );
}

function EventForm({
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

  const formIsDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
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
          <Tooltip>
            <Button variant="outline" size="icon" aria-label="Add citation">
              <PlusIcon className="size-4" />
            </Button>
            <TooltipContent>Add citation</TooltipContent>
          </Tooltip>
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

// Stable reference for the "names"/"events"/"unions" defaults below — an
// inline `[]` would be a fresh array every render, which oxlint's
// `no-object-type-as-default-prop` flags (a new default defeats memoization
// downstream, though nothing here currently memoizes on it).
const EMPTY_ROWS: never[] = [];

function CitationForm({
  personId,
  sourcesList,
  names = EMPTY_ROWS,
  events = EMPTY_ROWS,
  unions = EMPTY_ROWS,
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
  const createSourceMutation = useMutation({ mutationFn: createSource });
  const addCitationMutation = useMutation({ mutationFn: addCitation });

  const factOptions: FactOption[] = fixedFact
    ? [fixedFact]
    : [
        { key: "person|none", factType: "person", factId: null, label: "This person (general)" },
        // No separate "birth"/"death" entries — those are `person_events` rows
        // now (see PersonService), so they fall out of the `events.map` below
        // like any other event ("Event: Birth").
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

  const fields = (
    <>
      {!fixedFact && (
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
      )}

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
          Add
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

/**
 * Research to-dos: an open question to chase down later, or a plain note —
 * see `resolved` on `researchNoteSchema` for why closing one is a status
 * flip rather than a retype/delete. Modeled on `CitationsSection` above.
 */
function ResearchNotesSection({
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
  const updateNoteMutation = useMutation({ mutationFn: updateNote });
  const removeNoteMutation = useMutation({ mutationFn: removeNote });
  const [addOpen, setAddOpen] = useState(false);

  const toggleResolved = async (note: ResearchNoteRow) => {
    await updateNoteMutation.mutateAsync({ data: { id: note.id, resolved: !note.resolved } });
    await onChanged();
  };

  const remove = async (id: string) => {
    await removeNoteMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Research notes</CardTitle>
        <Dialog isOpen={addOpen} onOpenChange={setAddOpen}>
          <Tooltip>
            <Button variant="outline" size="icon" aria-label="Add research note">
              <PlusIcon className="size-4" />
            </Button>
            <TooltipContent>Add research note</TooltipContent>
          </Tooltip>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add research note</DialogTitle>
            </DialogHeader>
            <ResearchNoteForm
              personId={personId}
              options={options}
              onDone={async () => {
                setAddOpen(false);
                await onChanged();
              }}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">No research notes yet.</p>
        )}
        {notes.map((note) => (
          <div key={note.id} className="space-y-1 border-b pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={note.resolved ? "outline" : "secondary"}>
                {labelFor(options, "research_note_type", note.noteType)}
              </Badge>
              <div className="flex items-center gap-2">
                <Switch isSelected={note.resolved} onChange={() => void toggleResolved(note)}>
                  Resolved
                </Switch>
                <RemoveButton
                  itemLabel="this research note"
                  onConfirm={() => void remove(note.id)}
                />
              </div>
            </div>
            <MarkdownContent className="text-sm">{note.body}</MarkdownContent>
          </div>
        ))}
      </CardContent>
    </Card>
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
        aria-label="Note type"
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
      <MarkdownEditor value={body} onChange={setBody} aria-label="Research note" />
      <DialogFooter>
        <SaveButton
          isDirty={body.trim() !== ""}
          isPending={addNoteMutation.isPending}
          isDisabled={!canSubmit}
        >
          Add
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
