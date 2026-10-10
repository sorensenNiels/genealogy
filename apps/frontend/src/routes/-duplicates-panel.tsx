import { formatPersonName, type DuplicateConfidence } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Dialog } from "@genealogy/ui/components/dialog";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MergeIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import { formatDisplayDate } from "../lib/format-date";
import {
  clearDuplicateDismissals,
  dismissDuplicate,
  listDuplicates,
  undismissDuplicate,
} from "../server/functions/duplicate.functions";
import { DuplicateMatchSummary, MergeConfirmStep } from "./people/-merge-person-dialog";

type DuplicateReport = Awaited<ReturnType<typeof listDuplicates>>;
type Candidate = DuplicateReport["candidates"][number];
type PersonSummary = Candidate["a"];

const QUERY_KEY = ["duplicate", "list"] as const;

type Filter = "all" | DuplicateConfidence;

/**
 * Tools → Possible duplicates: pairs of people who look like one person
 * recorded twice, best first, each with why it was matched. Every pair is
 * for the admin to judge — "Merge…" opens the same preview the person
 * page's "Merge with…" does, "Not the same person" remembers the pair so it
 * isn't suggested again. Nothing is merged automatically.
 *
 * Runs as soon as the tool is opened, unlike the "Run check" reports: the
 * list *is* the tool, and it has to refresh after each merge or dismissal
 * anyway, which a query does for free.
 */
export function DuplicatesPanel({ title }: { title: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const report = useQuery({ queryKey: QUERY_KEY, queryFn: () => listDuplicates() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["duplicate"] });
  const clearMutation = useMutation({ mutationFn: clearDuplicateDismissals, onSuccess: refresh });

  const candidates = report.data?.candidates ?? [];
  const countOf = (confidence: DuplicateConfidence) =>
    candidates.filter((candidate) => candidate.confidence === confidence).length;
  const shown =
    filter === "all"
      ? candidates
      : candidates.filter((candidate) => candidate.confidence === filter);

  return (
    <SectionCard title={title}>
      <p className="text-sm text-muted-foreground">{t("duplicates.description")}</p>

      {report.isPending && (
        <p className="mt-4 text-sm text-muted-foreground">{t("duplicates.loading")}</p>
      )}
      {report.isError && <p className="mt-4 text-sm text-destructive">{report.error.message}</p>}

      {report.data && (
        <div className="mt-4 space-y-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("duplicates.none")}</p>
          ) : (
            <>
              <ButtonRadioGroup<Filter>
                aria-label={t("duplicates.filterLabel")}
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: "all", label: t("duplicates.filter.all", { count: candidates.length }) },
                  ...(["high", "medium", "low"] as const).map((confidence) => ({
                    value: confidence,
                    label: t(`duplicates.filter.${confidence}`, { count: countOf(confidence) }),
                  })),
                ]}
              />
              <ul className="divide-y rounded-md border">
                {shown.map((candidate) => (
                  <CandidateRow
                    key={`${candidate.a.id}|${candidate.b.id}`}
                    candidate={candidate}
                    onChanged={refresh}
                  />
                ))}
              </ul>
              {report.data.total > candidates.length && (
                <p className="text-sm text-muted-foreground">
                  {t("duplicates.more", { count: report.data.total - candidates.length })}
                </p>
              )}
            </>
          )}

          {report.data.dismissed > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-sm text-muted-foreground">
              <span>{t("duplicates.dismissedCount", { count: report.data.dismissed })}</span>
              <RemoveButton
                itemLabel={t("duplicates.clearItemLabel")}
                title={t("duplicates.clearTitle")}
                description={t("duplicates.clearDescription", { count: report.data.dismissed })}
                actionLabel={t("duplicates.clearAction")}
                onConfirm={() => clearMutation.mutate({})}
                trigger={
                  <Button variant="outline" size="sm" disabled={clearMutation.isPending}>
                    {t("duplicates.clearAction")}
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function CandidateRow({
  candidate,
  onChanged,
}: {
  candidate: Candidate;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const pair = { personAId: candidate.a.id, personBId: candidate.b.id };
  // Shown in place of the row until the list refetches, so a dismissal can
  // be undone right where it was made.
  const [dismissed, setDismissed] = useState(false);
  const dismissMutation = useMutation({
    mutationFn: dismissDuplicate,
    onSuccess: () => setDismissed(true),
  });
  const undoMutation = useMutation({
    mutationFn: undismissDuplicate,
    onSuccess: () => setDismissed(false),
  });

  if (dismissed) {
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
        {t("duplicates.dismissed", {
          a: formatPersonName(candidate.a) || t("tools.unnamed"),
          b: formatPersonName(candidate.b) || t("tools.unnamed"),
        })}
        <Button
          variant="outline"
          size="sm"
          disabled={undoMutation.isPending}
          onClick={() => undoMutation.mutate({ data: pair })}
        >
          {t("duplicates.undo")}
        </Button>
      </li>
    );
  }

  return (
    <li className="space-y-3 px-4 py-3">
      <DuplicateMatchSummary confidence={candidate.confidence} reasons={candidate.reasons} />
      <div className="grid gap-3 sm:grid-cols-2">
        <PersonFacts person={candidate.a} />
        <PersonFacts person={candidate.b} />
      </div>
      <div className="flex flex-wrap gap-2">
        <MergePairDialog candidate={candidate} onMerged={onChanged} />
        <Button
          variant="outline"
          size="sm"
          disabled={dismissMutation.isPending}
          onClick={() => dismissMutation.mutate({ data: pair })}
        >
          <XIcon /> {t("duplicates.dismiss")}
        </Button>
      </div>
      {(dismissMutation.isError || undoMutation.isError) && (
        <p className="text-sm text-destructive">
          {(dismissMutation.error ?? undoMutation.error)?.message}
        </p>
      )}
    </li>
  );
}

/** One side of a pair: the facts it was matched on, so most pairs can be judged without opening either page. */
function PersonFacts({ person }: { person: PersonSummary }) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const line = (label: string, date: PersonSummary["birth"], place: string | null) => {
    const parts = [formatDisplayDate(date, language), place].filter(Boolean);
    return parts.length > 0 ? (
      <p>
        {label} {parts.join(", ")}
      </p>
    ) : null;
  };
  return (
    <div className="min-w-0 text-sm">
      <Link
        to="/people/$personId"
        params={{ personId: person.id }}
        className="font-medium text-primary hover:underline"
      >
        {formatPersonName(person) || t("tools.unnamed")}
      </Link>{" "}
      <span className="font-mono text-xs text-muted-foreground">{person.publicId}</span>
      <div className="text-muted-foreground">
        {line(t("duplicates.born"), person.birth, person.birthPlace)}
        {line(t("duplicates.died"), person.death, person.deathPlace)}
      </div>
    </div>
  );
}

/** How many of the facts on a pair's card a person has. */
function factCount(person: PersonSummary): number {
  return [person.birth, person.birthPlace, person.death, person.deathPlace].filter(Boolean).length;
}

/**
 * The merge preview straight on a pair. Which one is kept starts as the
 * person with more facts on the card — a rough guess at the better
 * record — and "Keep the other instead" swaps it.
 */
function MergePairDialog({
  candidate,
  onMerged,
}: {
  candidate: Candidate;
  onMerged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const defaultKeepB = factCount(candidate.b) > factCount(candidate.a);
  const [keepB, setKeepB] = useState(defaultKeepB);
  const [keep, remove] = keepB ? [candidate.b, candidate.a] : [candidate.a, candidate.b];

  return (
    <Dialog
      trigger={
        <Button size="sm">
          <MergeIcon /> {t("duplicates.merge")}
        </Button>
      }
      title={t("duplicates.mergeTitle")}
      onOpenChange={(isOpen) => {
        if (!isOpen) setKeepB(defaultKeepB);
      }}
    >
      {(close) => (
        <MergeConfirmStep
          keepId={keep.id}
          keepName={formatPersonName(keep) || t("tools.unnamed")}
          duplicateId={remove.id}
          onBack={close}
          backLabel={t("common.cancel")}
          onSwap={() => setKeepB((value) => !value)}
          onMerged={async () => {
            close();
            await onMerged();
          }}
        />
      )}
    </Dialog>
  );
}
