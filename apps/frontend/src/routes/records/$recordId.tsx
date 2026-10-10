import { recordTypeSchema, splitHistoricalDateText } from "@genealogy/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../../i18n/create-i18n-instance";
import { useRecordSettings } from "../../lib/record-settings";
import { getRecord } from "../../server/functions/records.functions";
import { newRowKey, RecordEditor, recordTitle, type EditorState } from "./-record-editor";

/** One record, read or edited (Viewers read; editors edit). */
export const Route = createFileRoute("/records/$recordId")({
  component: RecordPage,
});

function RecordPage() {
  const { t, i18n } = useTranslation();
  const language = toSupportedLanguage(i18n.language);
  const settings = useRecordSettings();
  const { recordId } = Route.useParams();
  const record = useQuery({
    queryKey: ["records", "get", recordId],
    queryFn: () => getRecord({ data: { id: recordId } }),
  });

  if (record.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (record.isError) {
    return <p className="text-sm text-destructive">{record.error.message}</p>;
  }

  const data = record.data;
  const initial: EditorState = {
    id: data.id,
    recordType: recordTypeSchema.parse(data.recordType),
    censusKey: data.censusKey,
    date: splitHistoricalDateText(data.date?.original ?? "", language),
    place: data.place,
    address: data.address,
    reference: data.reference,
    sourceId: data.sourceId,
    page: data.page,
    url: data.url,
    notes: data.notes,
    people: data.people.map((row) => ({
      key: newRowKey(),
      id: row.id,
      role: row.role,
      name: row.name,
      sex: row.sex === "M" || row.sex === "F" ? row.sex : "U",
      age: row.age,
      maritalStatus: row.maritalStatus,
      occupation: row.occupation,
      residence: row.residence,
      birthplace: row.birthplace,
      person: row.person,
    })),
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {recordTitle(t, data, settings.customCensuses)}
        {data.place ? ` · ${data.place}` : ""}
      </h1>
      {/* Keyed by the data's last update, so a refetch after saving
          restarts the editor from what was saved. */}
      <RecordEditor key={String(data.updatedAt)} initial={initial} suggestions={data.suggestions} />
    </div>
  );
}
