import {
  allCensuses,
  censusesInLifetime,
  findCensus,
  formatPersonName,
  recordTypeSchema,
  type RecordType,
} from "@genealogy/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { yearsBetween } from "../../lib/life-summary";
import { useRecordSettingsQuery } from "../../lib/record-settings";
import { getPersonById } from "../../server/functions/person.functions";
import {
  censusDateParts,
  emptyRow,
  RecordEditor,
  type EditorRow,
  type EditorState,
} from "./-record-editor";

/**
 * A new record of any type (`?type=census`), usually opened from a person's
 * page (`?personId=`): that person is then the first row, linked, in the
 * role they'd usually have — the child at a baptism, the groom or bride at a
 * marriage, the deceased at a burial — and for a census (`?census=dk-1845`)
 * with their age on the census day worked out from their birth.
 */
export const Route = createFileRoute("/records/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { type?: RecordType; personId?: string; census?: string } => {
    const type = recordTypeSchema.safeParse(search.type);
    return {
      ...(type.success ? { type: type.data } : {}),
      ...(typeof search.personId === "string" ? { personId: search.personId } : {}),
      ...(typeof search.census === "string" ? { census: search.census } : {}),
    };
  },
  component: NewRecordPage,
});

/** The role a person usually has in a record of this type, when added from their page. */
function defaultRole(type: RecordType, sex: string): string {
  if (type === "baptism") return "child";
  if (type === "marriage") return sex === "F" ? "bride" : "groom";
  if (type === "burial") return "deceased";
  return "";
}

function NewRecordPage() {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const { type = "census", personId, census: censusParam } = Route.useSearch();
  const settings = useRecordSettingsQuery();
  const person = useQuery({
    queryKey: ["person", "byId", personId],
    queryFn: () => getPersonById({ data: { id: personId! } }),
    enabled: personId !== undefined,
  });

  if (settings.isPending || (personId && person.isPending)) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  const customCensuses = settings.data?.customCensuses ?? [];

  // The census: the one asked for, else the first one in the person's life
  // from the countries in use, else the first in use at all.
  let census = type === "census" ? findCensus(censusParam, customCensuses) : null;
  if (type === "census" && !census) {
    const inUse = allCensuses(customCensuses).filter((definition) =>
      (settings.data?.censusCountries ?? []).includes(definition.country),
    );
    census =
      (person.data ? censusesInLifetime(person.data, inUse)[0] : undefined) ?? inUse[0] ?? null;
  }

  const first: EditorRow = emptyRow(person.data ? defaultRole(type, person.data.gender) : "");
  if (person.data) {
    const born = person.data.birth?.earliest ?? person.data.birth?.latest ?? null;
    const age = census ? yearsBetween(born, census.date) : null;
    Object.assign(first, {
      name: formatPersonName(person.data),
      sex: person.data.gender,
      age: age === null ? "" : String(age),
      person: { id: person.data.id, given: person.data.given, surname: person.data.surname },
    });
  }
  const initial: EditorState = {
    recordType: type,
    censusKey: census?.key ?? null,
    date: censusDateParts(census, language),
    place: "",
    address: "",
    reference: "",
    sourceId: null,
    page: "",
    url: "",
    notes: "",
    people: [first],
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {person.data && (
          <Link
            to="/people/$personId"
            params={{ personId: person.data.id }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← {formatPersonName(person.data)}
          </Link>
        )}
        <h1 className="text-2xl font-semibold">
          {t("records.newTitle", { type: t(`records.type.${type}`) })}
        </h1>
      </div>
      <RecordEditor initial={initial} />
    </div>
  );
}
