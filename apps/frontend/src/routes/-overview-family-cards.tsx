import { formatKinship } from "@genealogy/core";
import { buttonVariants } from "@genealogy/ui/components/button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { NetworkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import { formatDisplayDate } from "../lib/format-date";
import { lifeAtAGlance } from "../lib/life-summary";
import { localToday } from "../lib/overview-cards";
import { GenderIcon } from "../lib/person-display";
import { usePersonName } from "../lib/person-name";
import {
  familyAtAGlanceQuery,
  featuredAncestorQuery,
  onThisDayQuery,
  topPlacesQuery,
} from "../lib/queries";
import { PersonChip } from "./-person-chip";

/** A card's loading and error states, so each card only says what it shows. */
export function CardBody<T>({
  query,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null; data: T | undefined };
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  if (query.isPending)
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (query.isError) return <p className="text-sm text-destructive">{query.error?.message}</p>;
  return <>{children(query.data as T)}</>;
}

/**
 * "On this day": births, marriages and deaths on today's date in past years,
 * oldest first — exact dates only, since a vague one can't say which day.
 * Which events, and whether living people's birthdays show (editors only),
 * is Settings → Overview's; a Viewer only ever gets the deceased.
 */
export function OnThisDayCard() {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const today = localToday();
  const entries = useQuery(onThisDayQuery(today));
  return (
    <SectionCard
      title={t("overview.onThisDay.title")}
      description={t("overview.onThisDay.description")}
    >
      <CardBody query={entries}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("overview.onThisDay.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((entry) => {
                const what = t(`overview.onThisDay.kind.${entry.eventType}`, {
                  defaultValue: entry.eventType,
                });
                return (
                  <li
                    key={`${entry.eventType}-${entry.people.map((person) => person.id).join("-")}`}
                    className="grid grid-cols-[3.5rem_1fr] gap-3 text-sm"
                  >
                    <span className="font-semibold tabular-nums">
                      {entry.date.earliest?.slice(0, 4)}
                    </span>
                    <span className="min-w-0">
                      <span className="block">
                        {entry.people.map((person, index) => (
                          <span key={person.id}>
                            {index > 0 && " & "}
                            <GenderIcon
                              gender={person.gender}
                              className="mr-1 size-3.5 align-[-2px]"
                            />
                            <Link
                              to="/people/$personId"
                              params={{ personId: person.id }}
                              className="font-medium hover:underline"
                            >
                              {formatName(person) || t("tools.unnamed")}
                            </Link>
                          </span>
                        ))}
                      </span>
                      <span className="block text-muted-foreground">
                        {entry.place
                          ? t("overview.onThisDay.whatWhere", { what, place: entry.place })
                          : what}
                        {entry.yearsAgo !== null &&
                          ` · ${t("overview.onThisDay.yearsAgo", { count: entry.yearsAgo })}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        }
      </CardBody>
      <p className="mt-3 text-xs text-muted-foreground">
        {formatDisplayDate({ original: today, earliest: today, latest: today }, language)}
      </p>
    </SectionCard>
  );
}

/**
 * "Featured ancestor": one deceased person a day — from the member's own
 * ancestors when they've linked themselves — with their photo, how they're
 * related and the person page's generated life summary.
 */
export function FeaturedAncestorCard() {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const featured = useQuery(featuredAncestorQuery(localToday()));
  return (
    <SectionCard
      title={t("overview.featuredAncestor.title")}
      description={t("overview.featuredAncestor.description")}
    >
      <CardBody query={featured}>
        {(data) => {
          if (!data) {
            return (
              <p className="text-sm text-muted-foreground">
                {t("overview.featuredAncestor.empty")}
              </p>
            );
          }
          const { sentences } = lifeAtAGlance({
            person: data.person,
            unions: data.unions.map((union) => ({
              startDate: union.startDate,
              startPlace: union.startPlace,
              status: union.status,
              partnerId: union.partnerId,
              partnerName: formatName(union.partnerName),
            })),
            childCount: data.childCount,
            formatDate: (date) => formatDisplayDate(date, language),
          });
          const words = data.kinship && formatKinship(data.kinship, data.person.gender, language);
          // `formatKinship` capitalises for a label; here it's mid-sentence ("Your grandmother").
          const kinship = words && words.charAt(0).toLocaleLowerCase() + words.slice(1);
          return (
            <div className="space-y-3">
              <PersonChip person={data.person} size="lg" />
              {kinship && (
                <p className="text-sm font-medium">
                  {t("overview.featuredAncestor.yourRelative", { kinship })}
                </p>
              )}
              {sentences.length > 0 && (
                <p className="text-sm leading-relaxed">
                  {sentences
                    .map((sentence) => t(`person.lifeSummary.${sentence.key}`, sentence.params))
                    .join(" ")}
                </p>
              )}
              <Link
                to="/tree"
                search={{ personId: data.person.id }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <NetworkIcon /> {t("overview.featuredAncestor.openTree")}
              </Link>
            </div>
          );
        }}
      </CardBody>
    </SectionCard>
  );
}

/**
 * "The family at a glance": the tree's figures, each linking to where it
 * comes from — the People list, grouped by surname or birthplace.
 */
export function FamilyAtAGlanceCard() {
  const { t } = useTranslation();
  const glance = useQuery(familyAtAGlanceQuery());
  return (
    <SectionCard
      title={t("overview.familyAtAGlance.title")}
      description={t("overview.familyAtAGlance.description")}
    >
      <CardBody query={glance}>
        {(data) => (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Figure
                label={t("overview.familyAtAGlance.people")}
                value={data.people}
                to="/people"
              />
              <Figure
                label={t("overview.familyAtAGlance.surnames")}
                value={data.surnames}
                to="/people"
                search={{ group: "surname" }}
              />
              <Figure
                label={t("overview.familyAtAGlance.places")}
                value={data.places}
                to="/people"
                search={{ group: "birthplace" }}
              />
              <Figure label={t("overview.familyAtAGlance.sources")} value={data.sources} />
              <Figure label={t("overview.familyAtAGlance.photos")} value={data.photos} />
              {data.earliestBirthYear !== null && data.latestBirthYear !== null && (
                <Figure
                  label={t("overview.familyAtAGlance.span")}
                  value={`${data.earliestBirthYear}–${data.latestBirthYear}`}
                  to="/people"
                  search={{ group: "century" }}
                />
              )}
            </dl>
            {data.earliest && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("overview.familyAtAGlance.earliest")}
                </p>
                <PersonChip person={data.earliest} />
              </div>
            )}
          </div>
        )}
      </CardBody>
    </SectionCard>
  );
}

function Figure({
  label,
  value,
  to,
  search,
}: {
  label: string;
  value: number | string;
  to?: "/people";
  search?: { group: "surname" | "birthplace" | "century" };
}) {
  const number = <dd className="text-2xl font-semibold tabular-nums">{value}</dd>;
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {to ? (
        <Link to={to} search={search ?? {}} className="hover:underline">
          {number}
        </Link>
      ) : (
        number
      )}
    </div>
  );
}

/**
 * "Where the family came from": the most common birthplaces, until there's
 * a map — each opening the People list filtered to that place.
 */
export function TopPlacesCard() {
  const { t } = useTranslation();
  const places = useQuery(topPlacesQuery());
  return (
    <SectionCard
      title={t("overview.topPlaces.title")}
      description={t("overview.topPlaces.description")}
    >
      <CardBody query={places}>
        {(rows) => {
          if (rows.length === 0) {
            return <p className="text-sm text-muted-foreground">{t("overview.topPlaces.empty")}</p>;
          }
          const most = Math.max(...rows.map((row) => row.count));
          return (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.place}
                  className="grid grid-cols-[1fr_6rem_2rem] items-center gap-3 text-sm"
                >
                  <Link
                    to="/people"
                    search={{ place: row.place }}
                    className="truncate hover:underline"
                    title={row.place}
                  >
                    {row.place}
                  </Link>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(row.count / most) * 100}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">{row.count}</span>
                </li>
              ))}
            </ul>
          );
        }}
      </CardBody>
    </SectionCard>
  );
}
