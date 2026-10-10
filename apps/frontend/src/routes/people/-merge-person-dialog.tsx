import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MergeIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PersonPicker } from "../-person-picker";
import { getMergePreview, mergePerson } from "../../server/functions/person.functions";

type MergePreview = Awaited<ReturnType<typeof getMergePreview>>;

/** The preview's counts, in the order they're listed — only non-zero ones are shown. */
const COUNT_KEYS = [
  "names",
  "events",
  "unions",
  "parents",
  "children",
  "spouses",
  "citations",
  "associations",
  "researchNotes",
  "photoLinks",
  "externalIds",
] as const;

/**
 * Folds a duplicate into the person whose page this is: pick the duplicate,
 * see exactly what moves over (and anything that blocks it), then confirm.
 * The duplicate is deleted; nothing on this person is overwritten. Meant for
 * cleaning up after a GEDCOM import, which adds everyone as new people.
 */
export function MergePersonDialog({
  personId,
  personName,
  onMerged,
}: {
  personId: string;
  personName: string;
  onMerged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  return (
    <FormDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          <MergeIcon /> {t("person.merge.button")}
        </Button>
      }
      title={t("person.merge.title", { name: personName })}
      onOpenChange={(isOpen) => {
        if (!isOpen) setDuplicateId(null);
      }}
    >
      {(close) =>
        duplicateId ? (
          <MergeConfirmStep
            keepId={personId}
            keepName={personName}
            duplicateId={duplicateId}
            onBack={() => setDuplicateId(null)}
            onMerged={async () => {
              close();
              await onMerged();
            }}
          />
        ) : (
          <PickDuplicateStep personId={personId} onPick={setDuplicateId} />
        )
      }
    </FormDialog>
  );
}

function PickDuplicateStep({
  personId,
  onPick,
}: {
  personId: string;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("person.merge.pickIntro")}</p>
      <PersonPicker
        aria-label={t("person.merge.searchLabel")}
        onSelect={(person) => onPick(person.id)}
        excludeIds={new Set([personId])}
      />
    </div>
  );
}

function MergeConfirmStep({
  keepId,
  keepName,
  duplicateId,
  onBack,
  onMerged,
}: {
  keepId: string;
  keepName: string;
  duplicateId: string;
  onBack: () => void;
  onMerged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const preview = useQuery({
    queryKey: ["person", "mergePreview", keepId, duplicateId],
    queryFn: () => getMergePreview({ data: { keepId, removeId: duplicateId } }),
  });
  const mergeMutation = useMutation({
    mutationFn: mergePerson,
    onSuccess: onMerged,
  });

  if (preview.isPending) {
    return <p className="text-sm text-muted-foreground">{t("person.merge.loading")}</p>;
  }
  if (preview.isError) {
    return <p className="text-sm text-destructive">{preview.error.message}</p>;
  }

  const data: MergePreview = preview.data;
  const duplicateLabel = `${data.duplicate.name}${data.duplicate.lifespan ? ` (${data.duplicate.lifespan})` : ""}`;
  const counts = COUNT_KEYS.filter((key) => data[key] > 0);
  const isBlocked = data.blockers.length > 0;

  return (
    <div className="space-y-3 text-sm">
      <p>
        {t("person.merge.summary", { duplicate: duplicateLabel, keep: keepName })}{" "}
        <span className="font-mono text-xs text-muted-foreground">{data.duplicate.publicId}</span>
      </p>

      {isBlocked ? (
        <ul className="space-y-1 text-destructive">
          {data.blockers.map((blocker) => (
            <li key={blocker}>{t(`person.merge.blocker.${blocker}`)}</li>
          ))}
        </ul>
      ) : (
        <>
          {counts.length > 0 ? (
            <div>
              <p className="font-medium">{t("person.merge.movesHeading")}</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {counts.map((key) => (
                  <li key={key}>{t(`person.merge.count.${key}`, { count: data[key] })}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("person.merge.nothingToMove")}</p>
          )}
          <ul className="space-y-1 text-muted-foreground">
            {data.identical > 0 && (
              <li>{t("person.merge.identical", { count: data.identical })}</li>
            )}
            {data.vitalConflicts > 0 && (
              <li>{t("person.merge.vitalConflicts", { count: data.vitalConflicts })}</li>
            )}
            {data.addsAlternateName && (
              <li>{t("person.merge.alternateName", { name: data.addsAlternateName })}</li>
            )}
            {data.takesPhoto && <li>{t("person.merge.takesPhoto")}</li>}
          </ul>
          <p className="font-medium text-destructive">
            {t("person.merge.warning", { duplicate: data.duplicate.name })}
          </p>
        </>
      )}

      {mergeMutation.isError && <p className="text-destructive">{mergeMutation.error.message}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          {t("person.merge.back")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isBlocked || mergeMutation.isPending}
          onClick={() => mergeMutation.mutate({ data: { keepId, removeId: duplicateId } })}
        >
          {mergeMutation.isPending ? t("person.merge.merging") : t("person.merge.confirm")}
        </Button>
      </DialogFooter>
    </div>
  );
}
