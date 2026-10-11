import {
  allCensuses,
  censusesInLifetime,
  estimatedBirthFromAge,
  findCensus,
  isPrincipal,
  parseRecordAge,
  recordTypeSchema,
  type RecordType,
} from "@genealogy/core";
import { AddButton } from "@genealogy/ui/components/add-button";
import { Button } from "@genealogy/ui/components/button";
import { DropdownMenu, DropdownMenuItem } from "@genealogy/ui/components/dropdown-menu";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { usePermissions } from "../../lib/permissions";
import { labelFor } from "../../lib/person-display";
import { usePersonPageDate } from "../../lib/person-settings";
import { useRecordSettings } from "../../lib/record-settings";
import { updatePerson } from "../../server/functions/person.functions";
import {
  clearCensusSearch,
  listPersonRecords,
  listRecordSearches,
  markCensusNotFound,
} from "../../server/functions/records.functions";
import { censusLabel, recordTitle } from "../records/-record-editor";
import type { ConfigurableOptionRow, PersonRow } from "./-types";

/**
 * A person's records (see "Records" in TECH_STACK.md): which censuses they
 * lived through and whether each has been found, searched in vain, or not
 * looked at yet — a research to-do list — then every record they're named
 * in (census, baptism, marriage, burial), and what those say that the
 * person record doesn't have yet (an estimated birth, a birthplace), one
 * click to use.
 *
 * The coverage grid lists the censuses of Settings' coverage countries plus
 * any country this person already has a census from — so someone who
 * emigrated shows both countries without every Dane showing US censuses.
 */
export function RecordsCard({
  person,
  options,
  onChanged,
}: {
  person: PersonRow;
  options: ConfigurableOptionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const formatDate = usePersonPageDate();
  const language = toSupportedLanguage(i18n.language);
  const { canEdit } = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useRecordSettings();
  const records = useQuery({
    queryKey: ["records", "forPerson", person.id],
    queryFn: () => listPersonRecords({ data: { personId: person.id } }),
  });
  const searches = useQuery({
    queryKey: ["records", "searches", person.id],
    queryFn: () => listRecordSearches({ data: { personId: person.id } }),
  });
  const refreshSearches = () =>
    queryClient.invalidateQueries({ queryKey: ["records", "searches", person.id] });
  const markNotFound = useMutation({ mutationFn: markCensusNotFound, onSuccess: refreshSearches });
  const clearSearch = useMutation({ mutationFn: clearCensusSearch, onSuccess: refreshSearches });
  const updatePersonMutation = useMutation({ mutationFn: updatePerson, onSuccess: onChanged });

  const entries = records.data ?? [];
  const notFound = searches.data ?? [];
  const foundCensusKeys = new Map(
    entries
      .filter((entry) => entry.record.recordType === "census" && entry.record.censusKey)
      .map((entry) => [entry.record.censusKey!, entry.record.id]),
  );
  const countries = [
    ...new Set([
      ...settings.coverageCountries,
      ...[...foundCensusKeys.keys()].flatMap(
        (key) => findCensus(key, settings.customCensuses)?.country ?? [],
      ),
    ]),
  ];
  const coverage = countries.map((country) => ({
    country,
    censuses: censusesInLifetime(
      person,
      allCensuses(settings.customCensuses).filter((definition) => definition.country === country),
    ),
  }));
  const hasBirth = Boolean(person.birth?.earliest ?? person.birth?.latest);
  const enabledTypes = recordTypeSchema.options.filter((type) =>
    settings.enabledRecordTypes.includes(type),
  );
  const newRecord = (type: RecordType, census?: string) =>
    void navigate({
      to: "/records/new",
      search: { type, personId: person.id, ...(census ? { census } : {}) },
    });

  // What the records say that the person record lacks: the birth from the
  // earliest record with an age, the birthplace from the first that has one.
  const ageSource = entries.find((entry) => parseRecordAge(entry.row.age) !== null);
  const ageDay = ageSource
    ? (ageSource.record.date?.earliest ??
      ageSource.record.date?.latest ??
      findCensus(ageSource.record.censusKey, settings.customCensuses)?.date ??
      null)
    : null;
  const estimatedBirth =
    !hasBirth && ageSource && ageDay
      ? estimatedBirthFromAge(ageSource.row.age, ageDay, language)
      : null;
  const birthplaceSource = person.birthPlace
    ? undefined
    : entries.find((entry) => entry.row.birthplace.trim() !== "");

  return (
    <SectionCard
      title={t("records.card.title")}
      titleClassName="text-base"
      action={
        canEdit && enabledTypes.length > 0 ? (
          <DropdownMenu trigger={<AddButton label={t("records.card.add")} />}>
            {enabledTypes.map((type) => (
              <DropdownMenuItem key={type} onClick={() => newRecord(type)}>
                {t(`records.type.${type}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenu>
        ) : undefined
      }
      contentClassName="space-y-5"
    >
      {settings.enabledRecordTypes.includes("census") && (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("records.card.censusCoverage")}
          </p>
          {!hasBirth ? (
            <p className="text-sm text-muted-foreground">{t("records.card.needsBirth")}</p>
          ) : (
            coverage.map(({ country, censuses }) =>
              censuses.length === 0 ? null : (
                <div key={country} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {t(`records.country.${country}`, { defaultValue: country })}
                  </span>
                  {censuses.map((census) => {
                    const recordId = foundCensusKeys.get(census.key);
                    const search = notFound.find((item) => item.censusKey === census.key);
                    const label = censusLabel(t, census);
                    if (recordId) {
                      return (
                        <Link
                          key={census.key}
                          to="/records/$recordId"
                          params={{ recordId }}
                          className={cn(
                            CHIP,
                            "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                          )}
                          aria-label={t("records.card.foundAria", { census: label })}
                        >
                          <CheckIcon className="size-3.5" aria-hidden="true" />
                          {census.year}
                        </Link>
                      );
                    }
                    const chip = (
                      <Button
                        variant="ghost"
                        className={cn(
                          CHIP,
                          "h-auto",
                          search
                            ? "bg-rose-500/10 text-rose-800 dark:text-rose-300"
                            : "border border-dashed text-muted-foreground",
                        )}
                        aria-label={t(
                          search ? "records.card.notFoundAria" : "records.card.openAria",
                          { census: label },
                        )}
                        disabled={!canEdit}
                      >
                        {search ? (
                          <XIcon className="size-3.5" aria-hidden="true" />
                        ) : (
                          <span aria-hidden="true">?</span>
                        )}
                        {census.year}
                      </Button>
                    );
                    if (!canEdit) return <span key={census.key}>{chip}</span>;
                    return (
                      <DropdownMenu key={census.key} trigger={chip}>
                        <DropdownMenuItem onClick={() => newRecord("census", census.key)}>
                          {t("records.card.addFor", { census: label })}
                        </DropdownMenuItem>
                        {search ? (
                          <DropdownMenuItem
                            onClick={() =>
                              clearSearch.mutate({
                                data: { personId: person.id, censusKey: census.key },
                              })
                            }
                          >
                            {t("records.card.clearNotFound")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() =>
                              markNotFound.mutate({
                                data: { personId: person.id, censusKey: census.key, note: "" },
                              })
                            }
                          >
                            {t("records.card.markNotFound")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenu>
                    );
                  })}
                </div>
              ),
            )
          )}
          {hasBirth && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>✓ {t("records.card.legendFound")}</span>
              <span>✕ {t("records.card.legendNotFound")}</span>
              <span>? {t("records.card.legendOpen")}</span>
            </p>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => {
            const type = recordTypeSchema.parse(entry.record.recordType);
            const role = entry.row.role
              ? type === "census"
                ? labelFor(options, "household_position", entry.row.role)
                : t(`records.role.${type}.${entry.row.role}`)
              : null;
            const own = [role, entry.row.age && t("records.card.age", { age: entry.row.age })]
              .filter(Boolean)
              .join(", ");
            const others =
              !isPrincipal(type, entry.row.role) || type === "census"
                ? entry.principalNames.filter((name) => name !== entry.row.name)
                : [];
            return (
              <li key={entry.record.id} className="text-sm">
                <Link
                  to="/records/$recordId"
                  params={{ recordId: entry.record.id }}
                  className="font-medium hover:underline"
                >
                  {recordTitle(t, entry.record, settings.customCensuses)}
                  {entry.record.recordType !== "census" && entry.record.date
                    ? ` · ${formatDate(entry.record.date)}`
                    : ""}
                  {entry.record.place ? ` · ${entry.record.place}` : ""}
                </Link>
                <p className="text-muted-foreground">
                  {[
                    own,
                    others.length > 0
                      ? t(type === "census" ? "records.card.inHouseholdOf" : "records.card.of", {
                          name: others.join(" & "),
                        })
                      : null,
                    t("records.card.people", { count: entry.memberCount }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (estimatedBirth || birthplaceSource) && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
          {estimatedBirth && ageSource && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {t("records.card.estimatedBirth", {
                  birth: formatDate(estimatedBirth),
                  record: recordTitle(t, ageSource.record, settings.customCensuses),
                  age: ageSource.row.age,
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={updatePersonMutation.isPending}
                onClick={() =>
                  updatePersonMutation.mutate({ data: { id: person.id, birth: estimatedBirth } })
                }
              >
                {t("records.card.useAsBirth")}
              </Button>
            </div>
          )}
          {birthplaceSource && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {t("records.card.birthplace", {
                  place: birthplaceSource.row.birthplace,
                  record: recordTitle(t, birthplaceSource.record, settings.customCensuses),
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={updatePersonMutation.isPending}
                onClick={() =>
                  updatePersonMutation.mutate({
                    data: { id: person.id, birthPlace: birthplaceSource.row.birthplace },
                  })
                }
              >
                {t("records.card.useAsBirthplace")}
              </Button>
            </div>
          )}
          {updatePersonMutation.isError && (
            <p className="text-destructive">{updatePersonMutation.error.message}</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

const CHIP =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums";
