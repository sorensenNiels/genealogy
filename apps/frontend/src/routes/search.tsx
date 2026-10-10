import {
  formatLifespan,
  formatPersonName,
  splitSearchSnippet,
  type SearchHitKind,
} from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { Input } from "@genealogy/ui/components/input";
import { useUrlDraft } from "@genealogy/ui/hooks/use-url-draft";
import { cn } from "@genealogy/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import { formatDisplayDate } from "../lib/format-date";
import { labelFor } from "../lib/person-display";
import { fullTextSearchQuery, listOptionsQuery } from "../lib/queries";
import type { searchFullText } from "../server/functions/search.functions";

type SearchHit = Awaited<ReturnType<typeof searchFullText>>["hits"][number];

/** The result filters: hits grouped by what a researcher is looking through. */
const GROUPS = {
  all: null,
  people: ["personNote", "name", "event", "union", "association"],
  citations: ["citation"],
  records: ["record", "recordPerson"],
  researchNotes: ["researchNote"],
} as const satisfies Record<string, readonly SearchHitKind[] | null>;
type Group = keyof typeof GROUPS;

/** The configurable-options topic labelling each kind's `context`, where it has one. */
const CONTEXT_TOPIC: Partial<Record<SearchHitKind, string>> = {
  name: "name_variant_type",
  event: "event_type",
  union: "union_status",
  association: "association_role",
  researchNote: "research_note_type",
};

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q.trim() !== "" ? { q: search.q } : {},
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: ({ context: { queryClient }, deps: { q } }) =>
    Promise.all([
      queryClient.prefetchQuery(fullTextSearchQuery(q)),
      queryClient.prefetchQuery(listOptionsQuery()),
    ]),
  component: SearchPage,
});

/**
 * Full-text search across what people have written into the tree — notes,
 * citations, events, research notes and records — rather than names (the
 * People list searches those). The query lives in the URL, so a search can
 * be bookmarked, shared, and gone back to; the header's search box lands
 * here.
 */
function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/search" });
  const { q = "" } = Route.useSearch();
  const [group, setGroup] = useState<Group>("all");
  // Typing searches after a short pause, replacing the history entry so
  // each keystroke isn't one more step back.
  const [draft, setDraft] = useUrlDraft(
    q,
    (next) => void navigate({ search: next ? { q: next } : {}, replace: true }),
    (text) => text.trim(),
  );

  const results = useQuery({ ...fullTextSearchQuery(q), placeholderData: keepPreviousData });
  const hits = q.trim().length >= 2 ? (results.data?.hits ?? []) : [];
  const countIn = (key: Group) => {
    const kinds: readonly SearchHitKind[] | null = GROUPS[key];
    return kinds ? hits.filter((hit) => kinds.includes(hit.kind)).length : hits.length;
  };
  const groupKinds: readonly SearchHitKind[] | null = GROUPS[group];
  const shown = groupKinds ? hits.filter((hit) => groupKinds.includes(hit.kind)) : hits;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("search.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("search.description")}</p>
      </div>

      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          className="pl-9"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.label")}
        />
      </div>

      {q.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">{t("search.tooShort")}</p>
      ) : results.isError ? (
        <p className="text-sm text-destructive">{results.error.message}</p>
      ) : results.isPending ? (
        <p className="text-sm text-muted-foreground">{t("search.searching")}</p>
      ) : hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("search.noResults", { query: q })}</p>
      ) : (
        <div className="space-y-4">
          <ButtonRadioGroup<Group>
            aria-label={t("search.filterLabel")}
            value={group}
            onValueChange={setGroup}
            options={(Object.keys(GROUPS) as Group[])
              .filter((key) => key === "all" || countIn(key) > 0)
              .map((key) => ({
                value: key,
                label: t(`search.group.${key}`, { count: countIn(key) }),
              }))}
          />
          <Card>
            <CardContent
              aria-busy={results.isPlaceholderData}
              className={cn(
                "p-0 transition-opacity",
                results.isPlaceholderData && "opacity-60 delay-150",
              )}
            >
              <ul className="divide-y">
                {shown.map((hit) => (
                  <HitRow key={`${hit.kind}:${hit.id}`} hit={hit} />
                ))}
              </ul>
            </CardContent>
          </Card>
          {results.data?.truncated && (
            <p className="text-sm text-muted-foreground">{t("search.truncated")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function HitRow({ hit }: { hit: SearchHit }) {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const options = useQuery(listOptionsQuery());

  const topic = CONTEXT_TOPIC[hit.kind];
  const context =
    hit.context === null
      ? null
      : topic
        ? labelFor(options.data ?? [], topic, hit.context)
        : hit.kind === "record" || hit.kind === "recordPerson"
          ? t(`records.type.${hit.context}`)
          : hit.context;

  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {hit.person && (
          <Link
            to="/people/$personId"
            params={{ personId: hit.person.id }}
            className="font-medium text-primary hover:underline"
          >
            {formatPersonName(hit.person) || t("tools.unnamed")}
            {formatLifespan(hit.person) && (
              <span className="font-normal text-muted-foreground">
                {" "}
                ({formatLifespan(hit.person)})
              </span>
            )}
          </Link>
        )}
        {hit.record && (
          <Link
            to="/records/$recordId"
            params={{ recordId: hit.record.id }}
            className={cn(
              "hover:underline",
              hit.person ? "text-muted-foreground" : "font-medium text-primary",
            )}
          >
            {[
              t(`records.type.${hit.record.recordType}`),
              formatDisplayDate(hit.record.date, language),
              hit.record.place,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Link>
        )}
        <Badge variant="outline">{t(`search.kind.${hit.kind}`)}</Badge>
        {context && hit.kind !== "record" && hit.kind !== "recordPerson" && (
          <span className="text-muted-foreground">{context}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {splitSearchSnippet(hit.snippet).map((part, index) =>
          part.match ? (
            <mark key={index} className="rounded-sm bg-primary/15 px-0.5 text-foreground">
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
    </li>
  );
}
