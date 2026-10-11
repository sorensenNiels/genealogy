import { Button } from "@genealogy/ui/components/button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import {
  immichStatusQueryKey,
  immichUnavailableMessage,
  useImmichStatus,
} from "../lib/immich-status";
import { labelFor } from "../lib/person-display";
import { usePersonName } from "../lib/person-name";
import {
  censusGapsQuery,
  healthQuery,
  listOptionsQuery,
  recentChangesQuery,
  researchTodoQuery,
  upkeepQuery,
} from "../lib/queries";
import { getImmichStatus } from "../server/functions/immich.functions";
import { getUpkeep } from "../server/functions/overview.functions";
import { CardBody } from "./-overview-family-cards";
import { censusLabel } from "./records/-record-editor";

/** A research note's first line as plain text — the body is markdown. */
function firstLine(markdown: string): string {
  const line = markdown.split("\n").find((text) => text.trim() !== "") ?? "";
  return line.replace(/[#*_>`[\]]/g, "").trim();
}

/**
 * "Research to-do" (editors): the newest open research notes with their
 * person, and how many people are still missing each research checklist
 * item — each count opening the People list's "Missing" filter on it.
 */
export function ResearchTodoCard() {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const todo = useQuery(researchTodoQuery());
  const options = useQuery(listOptionsQuery());
  return (
    <SectionCard
      title={t("overview.researchTodo.title")}
      description={t("overview.researchTodo.description")}
    >
      <CardBody query={todo}>
        {(data) => (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("overview.researchTodo.openNotes", { count: data.openNoteCount })}
              </p>
              {data.openNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("overview.researchTodo.noOpenNotes")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.openNotes.map((note) => (
                    <li key={note.id} className="text-sm">
                      <Link
                        to="/people/$personId"
                        params={{ personId: note.personId }}
                        className="font-medium hover:underline"
                      >
                        {formatName(note) || t("tools.unnamed")}
                      </Link>
                      <span className="text-muted-foreground">
                        {" · "}
                        {labelFor(options.data ?? [], "research_note_type", note.noteType)}
                      </span>
                      <span className="block truncate text-muted-foreground">
                        {firstLine(note.body)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("overview.researchTodo.missing")}</p>
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {data.missing
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <li key={item.key} className="flex justify-between gap-2 text-sm">
                      <Link
                        to="/people"
                        search={{ missing: item.key }}
                        className="truncate hover:underline"
                      >
                        {t(`person.checklist.item.${item.key}`)}
                      </Link>
                      <span className="tabular-nums">{item.count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}
      </CardBody>
    </SectionCard>
  );
}

/**
 * "Census gaps" (editors): the censuses with the most people alive on the
 * census day who haven't been found in it or marked searched — the person
 * page's coverage grid, summed over the tree, as the next records to look up.
 */
export function CensusGapsCard() {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const gaps = useQuery(censusGapsQuery());
  return (
    <SectionCard
      title={t("overview.censusGaps.title")}
      description={t("overview.censusGaps.description")}
    >
      <CardBody query={gaps}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("overview.censusGaps.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((gap) => (
                <li key={gap.census.key} className="text-sm">
                  <span className="font-medium">{censusLabel(t, gap.census)}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {t("overview.censusGaps.notSearched", { count: gap.count })}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {gap.sample.map((person, index) => (
                      <span key={person.id}>
                        {index > 0 && ", "}
                        <Link
                          to="/people/$personId"
                          params={{ personId: person.id }}
                          className="hover:underline"
                        >
                          {formatName(person) || t("tools.unnamed")}
                        </Link>
                      </span>
                    ))}
                    {gap.count > gap.sample.length &&
                      ` ${t("overview.censusGaps.andMore", { count: gap.count - gap.sample.length })}`}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </CardBody>
    </SectionCard>
  );
}

/**
 * "Recently added and changed" (editors): the newest people and those
 * changed since — to pick up where someone else left off. There's no audit
 * log, so it says what and when, not who.
 */
export function RecentChangesCard() {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const changes = useQuery(recentChangesQuery());
  const when = (date: Date) =>
    date.toLocaleDateString(language === "da" ? "da-DK" : "en-GB", {
      day: "numeric",
      month: "short",
    });
  const list = (
    title: string,
    people: { id: string; given: string; surname: string; at: Date }[],
  ) => (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("overview.recentChanges.none")}</p>
      ) : (
        <ul className="space-y-1">
          {people.map((person) => (
            <li key={person.id} className="flex justify-between gap-2 text-sm">
              <Link
                to="/people/$personId"
                params={{ personId: person.id }}
                className="truncate hover:underline"
              >
                {formatName(person) || t("tools.unnamed")}
              </Link>
              <span className="shrink-0 text-muted-foreground">{when(person.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <SectionCard
      title={t("overview.recentChanges.title")}
      description={t("overview.recentChanges.description")}
    >
      <CardBody query={changes}>
        {(data) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {list(
              t("overview.recentChanges.added"),
              data.added.map((person) => ({ ...person, at: person.createdAt })),
            )}
            {list(
              t("overview.recentChanges.changed"),
              data.changed.map((person) => ({ ...person, at: person.updatedAt })),
            )}
          </div>
        )}
      </CardBody>
    </SectionCard>
  );
}

/**
 * "Things to look at" (admins): the Tools reports as counts, each linking
 * to its tool. The server keeps the counts for ten minutes — the reports
 * read the whole tree — and "Check again" redoes them.
 */
export function UpkeepCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const upkeep = useQuery(upkeepQuery());
  const recheck = useMutation({
    mutationFn: () => getUpkeep({ data: { refresh: true } }),
    onSuccess: (fresh) => queryClient.setQueryData(upkeepQuery().queryKey, fresh),
  });
  return (
    <SectionCard
      title={t("overview.thingsToLook.title")}
      description={t("overview.thingsToLook.description")}
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={upkeep.isPending || recheck.isPending}
          onClick={() => recheck.mutate()}
        >
          {t("immich.checkAgain")}
        </Button>
      }
    >
      <CardBody query={upkeep}>
        {(data) => {
          const rows = [
            { key: "likelyDuplicates", count: data.likelyDuplicates, tool: "duplicates" as const },
            {
              key: "possibleDuplicates",
              count: data.possibleDuplicates,
              tool: "duplicates" as const,
            },
            {
              key: "integrityFindings",
              count: data.integrityFindings,
              tool: "data-integrity" as const,
            },
            {
              key: "presumedDeceased",
              count: data.presumedDeceased,
              tool: "presumed-deceased" as const,
            },
            { key: "unlinkedFaces", count: data.unlinkedFaces, tool: "immich-faces" as const },
          ].filter((row): row is typeof row & { count: number } => row.count !== null);
          const nothing = rows.every((row) => row.count === 0) && data.pendingInvitations === 0;
          return (
            <div className="space-y-2">
              {nothing && (
                <p className="text-sm text-muted-foreground">
                  {t("overview.thingsToLook.allClear")}
                </p>
              )}
              <ul className="space-y-1">
                {rows
                  .filter((row) => row.count > 0)
                  .map((row) => (
                    <li key={row.key} className="flex justify-between gap-2 text-sm">
                      <Link to="/tools" search={{ tool: row.tool }} className="hover:underline">
                        {t(`overview.thingsToLook.${row.key}`)}
                      </Link>
                      <span className="tabular-nums">{row.count}</span>
                    </li>
                  ))}
                {data.pendingInvitations > 0 && (
                  <li className="flex justify-between gap-2 text-sm">
                    <Link to="/members" className="hover:underline">
                      {t("overview.thingsToLook.pendingInvitations")}
                    </Link>
                    <span className="tabular-nums">{data.pendingInvitations}</span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-muted-foreground">
                {t("overview.thingsToLook.checkedAt", {
                  time: data.checkedAt.toLocaleTimeString(),
                })}
              </p>
            </div>
          );
        }}
      </CardBody>
    </SectionCard>
  );
}

/**
 * "System status" (admins): the backend and Immich, once two cards of
 * their own on everyone's Overview — nothing a family member can act on.
 */
export function SystemCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const health = useQuery(healthQuery());
  const status = useImmichStatus();
  // Bypasses the backend's 30s probe cache, then seeds the shared query so
  // the nav link and every other gate pick up the new answer immediately.
  const recheck = useMutation({
    mutationFn: () => getImmichStatus({ data: { refresh: true } }),
    onSuccess: (fresh) => queryClient.setQueryData(immichStatusQueryKey, fresh),
  });
  return (
    <SectionCard
      title={t("overview.system.title")}
      description={t("overview.system.description")}
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={status.isPending || recheck.isPending}
          onClick={() => recheck.mutate()}
        >
          {t("immich.checkAgain")}
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{t("overview.backendTitle")}</p>
          {health.isPending && <p className="text-muted-foreground">{t("overview.checking")}</p>}
          {health.isError && (
            <p className="text-destructive">
              {t("overview.unreachable", { message: health.error.message })}
            </p>
          )}
          {health.data && (
            <p>
              {t("overview.checkedAt", {
                status: health.data.status,
                time: health.data.checkedAt.toLocaleTimeString(),
              })}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-medium">{t("overview.immichTitle")}</p>
          {status.isPending && <p className="text-muted-foreground">{t("overview.checking")}</p>}
          {status.isError && (
            <p className="text-destructive">
              {t("overview.unreachable", { message: status.error.message })}
            </p>
          )}
          {status.data &&
            (status.data.available ? (
              <p>{t("immich.connected", { version: status.data.version ?? "" })}</p>
            ) : (
              <>
                <p className={status.data.configured ? "text-destructive" : undefined}>
                  {immichUnavailableMessage(t, status.data)}
                </p>
                <p className="text-muted-foreground">{t("immich.featuresOff")}</p>
              </>
            ))}
          {status.data && (
            <p className="text-muted-foreground">
              {t("immich.checkedAt", { time: status.data.checkedAt.toLocaleTimeString() })}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
