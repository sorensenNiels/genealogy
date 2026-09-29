import {
  formatPersonName,
  type CitationFactType,
  type HistoricalDate,
  type Gender,
} from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Tooltip, TooltipContent } from "@genealogy/ui/components/tooltip";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { formatDisplayDate } from "../../lib/format-date";
import { labelFor, optionsFor } from "../../lib/person-display";
import { removeEvent } from "../../server/functions/person.functions";
import { eventDetailFields, EventForm } from "./-event-form";
import type {
  CitationRow,
  ConfigurableOptionRow,
  ParentRow,
  PersonEventRow,
  PersonRow,
  SourceRow,
  UnionRow,
} from "./-types";

/** Earliest-first sort key for the Life events timeline; undated entries sort last. */
function timelineSortValue(date: HistoricalDate | null): number {
  const iso = date?.earliest ?? date?.latest ?? null;
  return iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY;
}

/**
 * The single highest-ranked confidence option currently configured (by
 * `sortOrder`) — "top tier" for the dot below, not a specific confidence
 * value, so the 3-state dot (top/cited/uncited) still works whatever labels
 * or how many levels Settings has configured.
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
  t: TFunction,
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
    return t("person.events.ageWeeks", { count: weeks });
  }
  let age = eventDate.getUTCFullYear() - born.getUTCFullYear();
  const hadBirthday =
    eventDate.getUTCMonth() > born.getUTCMonth() ||
    (eventDate.getUTCMonth() === born.getUTCMonth() && eventDate.getUTCDate() >= born.getUTCDate());
  if (!hadBirthday) age -= 1;
  return t("person.events.age", { age });
}

/** "Son of X and Y" — gender-aware, and only for a birth event; derived from the existing Parents card data, not a new field. */
function parentageLine(
  gender: Gender,
  parents: { given: string; surname: string }[],
  t: TFunction,
): string | null {
  if (parents.length === 0) return null;
  const names = parents
    .map((parent) => formatPersonName(parent))
    .join(` ${t("person.events.and")} `);
  const key =
    gender === "M"
      ? "person.events.sonOf"
      : gender === "F"
        ? "person.events.daughterOf"
        : "person.events.childOf";
  return t(key, { parents: names });
}

type TimelineEntry =
  | { kind: "event"; date: HistoricalDate | null; event: PersonEventRow }
  | { kind: "union"; date: HistoricalDate | null; union: UnionRow };

/**
 * A single vertical timeline merging birth/baptism/census/etc. (`personEvents`)
 * with marriages (`unions`, which live in their own table/card — see the
 * Family card's Spouses section) into one date-ordered read history.
 * Marriages show read-only here; editing one still happens from the Spouses
 * section, which already owns that union's full lifecycle (status, dates,
 * removal) — duplicating that here would be a second, easy-to-desync place
 * to change the same record.
 */
export function LifeEventsCard({
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
  const { t } = useTranslation();
  const removeEventMutation = useMutation({ mutationFn: removeEvent });
  const topKey = topConfidenceKey(options);

  const removeEventById = async (id: string) => {
    await removeEventMutation.mutateAsync({ data: { id } });
    await onChanged();
  };

  const spouseName = (union: UnionRow): string => {
    const otherId = union.personAId === personId ? union.personBId : union.personAId;
    const spouse = spouses.find((candidate) => candidate.id === otherId);
    return spouse ? formatPersonName(spouse) : t("person.events.unknownSpouse");
  };

  const entries: TimelineEntry[] = [
    ...events.map((event) => ({ kind: "event" as const, date: event.date, event })),
    ...unions
      .filter((union) => union.personAId === personId || union.personBId === personId)
      .map((union) => ({ kind: "union" as const, date: union.startDate, union })),
  ].toSorted((a, b) => timelineSortValue(a.date) - timelineSortValue(b.date));

  return (
    <SectionCard
      title={t("person.events.title")}
      titleClassName="text-base"
      contentClassName="space-y-4"
      action={
        <FormDialog
          trigger={
            <Tooltip>
              <Button variant="outline" size="icon" aria-label={t("person.events.addEvent")}>
                <PlusIcon className="size-4" />
              </Button>
              <TooltipContent>{t("person.events.addEvent")}</TooltipContent>
            </Tooltip>
          }
          title={t("person.events.addEvent")}
        >
          {(close) => (
            <EventForm
              personId={personId}
              event={null}
              citations={citations}
              sourcesList={sourcesList}
              options={options}
              onDone={async () => {
                close();
                await onChanged();
              }}
              onChanged={onChanged}
            />
          )}
        </FormDialog>
      }
    >
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ConfidenceDot tier="top" /> {t("person.events.primarySource")}
        </span>
        <span className="flex items-center gap-1.5">
          <ConfidenceDot tier="cited" /> {t("person.events.secondary")}
        </span>
        <span className="flex items-center gap-1.5">
          <ConfidenceDot tier="none" /> {t("person.events.unsourced")}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("person.events.noEventsYet")}</p>
      ) : (
        <div className="relative space-y-5">
          <div className="absolute top-1.5 bottom-1.5 left-23 w-px bg-border" aria-hidden="true" />
          {entries.map((entry) =>
            entry.kind === "event" ? (
              <EventTimelineRow
                key={entry.event.id}
                personId={personId}
                event={entry.event}
                personBirth={person.birth}
                parents={parents}
                personGender={person.gender}
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
    </SectionCard>
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
  personGender,
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
  personGender: Gender;
  citations: CitationRow[];
  sourcesList: SourceRow[];
  options: ConfigurableOptionRow[];
  topKey: string | null;
  onChanged: () => Promise<void>;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const eventCitations = citations.filter(
    (citation) => citation.factType === "event" && citation.factId === event.id,
  );
  const tier = confidenceTier(citations, "event", event.id, topKey);
  const age = event.eventType === "birth" ? null : formatEventAge(personBirth, event.date, t);
  const detailFieldsByType = eventDetailFields(t);
  const detailLine = [
    event.eventType === "birth" ? parentageLine(personGender, parents, t) : null,
    event.details && Object.keys(event.details).length > 0
      ? Object.entries(event.details)
          .map(([key, value]) => {
            const label = detailFieldsByType[event.eventType]?.find(
              (field) => field.key === key,
            )?.label;
            return `${label ?? key}: ${value}`;
          })
          .join(" · ")
      : null,
  ].filter((line): line is string => line !== null);

  return (
    <div className="group grid grid-cols-[80px_16px_1fr_auto] items-start gap-x-3 text-sm">
      <TimelineLead date={formatDisplayDate(event.date, language)} age={age} tier={tier} />
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
          <FormDialog
            trigger={
              <Button type="button" variant="ghost" size="sm">
                {t("common.edit")}
              </Button>
            }
            title={t("person.events.editEvent")}
          >
            {(close) => (
              <EventForm
                personId={personId}
                event={event}
                citations={citations}
                sourcesList={sourcesList}
                options={options}
                onDone={async () => {
                  close();
                  await onChanged();
                }}
                onChanged={onChanged}
              />
            )}
          </FormDialog>
          <RemoveButton
            itemLabel={t("person.events.thisEventLabel", {
              type: labelFor(options, "event_type", event.eventType),
            })}
            onConfirm={onRemove}
          />
        </div>
      </div>
      <Badge variant="outline" className="shrink-0 whitespace-nowrap">
        {eventCitations.length === 0
          ? t("person.events.unsourced")
          : t("person.events.sourceCount", { count: eventCitations.length })}
      </Badge>
    </div>
  );
}

/** Read-only — see the comment on `LifeEventsCard` for why editing a union stays in the Family card's Spouses section rather than being duplicated here. */
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
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const unionCitations = citations.filter(
    (citation) => citation.factType === "union" && citation.factId === union.id,
  );
  const tier = confidenceTier(citations, "union", union.id, topKey);
  const age = formatEventAge(personBirth, union.startDate, t);
  const title =
    union.status === "married"
      ? t("person.events.marriage")
      : labelFor(options, "union_status", union.status);

  return (
    <div className="grid grid-cols-[80px_16px_1fr_auto] items-start gap-x-3 text-sm">
      <TimelineLead date={formatDisplayDate(union.startDate, language)} age={age} tier={tier} />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {union.startPlace && <p className="text-muted-foreground">{union.startPlace}</p>}
        <p className="text-xs text-muted-foreground">
          {t("person.events.toSpouse", { name: spouseName })}
        </p>
        {union.notes && (
          <MarkdownContent className="text-xs text-muted-foreground">{union.notes}</MarkdownContent>
        )}
      </div>
      <Badge variant="outline" className="shrink-0 whitespace-nowrap">
        {unionCitations.length === 0
          ? t("person.events.unsourced")
          : t("person.events.sourceCount", { count: unionCitations.length })}
      </Badge>
    </div>
  );
}
