import {
  GEDCOM_IMPORT_MAX_CHARS,
  decodeGedcomBytes,
  type GedcomImportInput,
  type GedcomVersion,
  isAdmin,
  type Language,
} from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { FileDropZone } from "@genealogy/ui/components/file-drop-zone";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useSearch } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  DatabaseBackupIcon,
  FileDownIcon,
  FileUpIcon,
  GlobeIcon,
  ScanFaceIcon,
  SearchCheckIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import { formatDisplayDate } from "../lib/format-date";
import { useImmichAvailable } from "../lib/immich-status";
import { useIsLocalhost } from "../lib/localhost";
import { usePersonName } from "../lib/person-name";
import { createBackup } from "../server/functions/backup.functions";
import {
  exportGedcom,
  importGedcom,
  previewGedcomImport,
} from "../server/functions/gedcom.functions";
import { enqueueAllAlbumsZip, rescanImmichFaces } from "../server/functions/immich.functions";
import { checkDataIntegrity, checkGraphConsistency } from "../server/functions/integrity.functions";
import { getPresumedDeceased, markPresumedDeceased } from "../server/functions/person.functions";
import { createStaticSite } from "../server/functions/static-site.functions";
import { DuplicatesPanel } from "./-duplicates-panel";
import { formatPersonWithLifespan, PersonPicker, type PersonListItem } from "./-person-picker";

const TOOLS = [
  "backup",
  "restore",
  "immich-faces",
  "gedcom-export",
  "gedcom-import",
  "family-website",
  "duplicates",
  "data-integrity",
  "presumed-deceased",
  "graph-consistency",
] as const;
type Tool = (typeof TOOLS)[number];

function toolLabels(t: TFunction): Record<Tool, string> {
  return {
    backup: t("tools.tool.backup"),
    restore: t("tools.tool.restore"),
    "immich-faces": t("tools.tool.immich-faces"),
    "gedcom-export": t("tools.tool.gedcom-export"),
    "gedcom-import": t("tools.tool.gedcom-import"),
    "family-website": t("tools.tool.family-website"),
    duplicates: t("tools.tool.duplicates"),
    "data-integrity": t("tools.tool.data-integrity"),
    "presumed-deceased": t("tools.tool.presumed-deceased"),
    "graph-consistency": t("tools.tool.graph-consistency"),
  };
}

/**
 * Development tools: pages for working on the app itself, not on the tree.
 * Linked from the Tools page only when browsing on localhost (see
 * `useIsLocalhost`); each is its own route, so it opens full-width.
 */
const DEV_TOOLS = [{ to: "/dev/components", labelKey: "tools.devTool.components" }] as const;

const RESTORE_CONFIRMATION_TEXT = "RESTORE";

export const Route = createFileRoute("/tools")({
  // Admin-only (the backend enforces it too); anyone else goes home.
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.role)) throw redirect({ to: "/" });
  },
  validateSearch: (search: Record<string, unknown>): { tool?: Tool } => {
    const tool = TOOLS.find((option) => option === search.tool);
    return tool ? { tool } : {};
  },
  component: ToolsRoute,
});

function ToolsRoute() {
  const { t } = useTranslation();
  const { tool = TOOLS[0] } = useSearch({ from: "/tools" });
  // Immich is opt-in infrastructure — same "hidden entirely, not just empty"
  // treatment as `PersonPhotosCard`: no reason to offer a face-rescan tool
  // for infrastructure that isn't available.
  const immichAvailable = useImmichAvailable();
  const visibleTools = TOOLS.filter((option) => option !== "immich-faces" || immichAvailable);
  const isLocalhost = useIsLocalhost();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("tools.title")}</h1>
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <SectionCard title={t("tools.toolsNav")} titleClassName="text-base" className="h-fit">
          <nav className="flex flex-col gap-1">
            {visibleTools.map((option) => (
              <Link
                key={option}
                to="/tools"
                search={{ tool: option }}
                className={cn(
                  "rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  option === tool && "border-primary bg-accent font-medium text-foreground",
                )}
              >
                {toolLabels(t)[option]}
              </Link>
            ))}
          </nav>
          {isLocalhost && (
            <nav
              aria-labelledby="dev-tools-heading"
              className="mt-4 flex flex-col gap-1 border-t pt-4"
            >
              <h3
                id="dev-tools-heading"
                className="px-3 pb-1 text-xs font-medium text-muted-foreground uppercase"
              >
                {t("tools.devNav")}
              </h3>
              {DEV_TOOLS.map((devTool) => (
                <Link
                  key={devTool.to}
                  to={devTool.to}
                  className="rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t(devTool.labelKey)}
                </Link>
              ))}
            </nav>
          )}
        </SectionCard>
        {tool === "backup" && <BackupPanel />}
        {tool === "restore" && <RestorePanel />}
        {tool === "immich-faces" && immichAvailable && <FaceRescanPanel />}
        {tool === "gedcom-export" && <GedcomExportPanel />}
        {tool === "gedcom-import" && <GedcomImportPanel />}
        {tool === "family-website" && <FamilyWebsitePanel />}
        {tool === "duplicates" && <DuplicatesPanel title={toolLabels(t).duplicates} />}
        {tool === "data-integrity" && <DataIntegrityPanel />}
        {tool === "presumed-deceased" && <PresumedDeceasedPanel />}
        {tool === "graph-consistency" && <GraphConsistencyPanel />}
      </div>
    </div>
  );
}

function BackupPanel() {
  const { t } = useTranslation();
  // Generating the dump is a queued BullMQ job (see TECH_STACK.md's
  // "Long-running work" section), not something this request waits on —
  // this just kicks it off, and the notification bell is what tells the
  // user their file is ready.
  const createBackupMutation = useMutation({ mutationFn: createBackup });
  const albumZipMutation = useMutation({ mutationFn: enqueueAllAlbumsZip });
  // Shares `ToolsRoute`'s cached status query — Immich is optional
  // infrastructure, so the photo-backup button only makes sense when it's up.
  const immichAvailable = useImmichAvailable();

  return (
    <SectionCard title={toolLabels(t).backup}>
      <p className="text-sm text-muted-foreground">{t("tools.backupDescription")}</p>
      <div className="mt-4">
        <Button
          disabled={createBackupMutation.isPending}
          onClick={() => createBackupMutation.mutate()}
        >
          <DatabaseBackupIcon className="size-4" aria-hidden="true" />
          {createBackupMutation.isPending ? t("tools.starting") : t("tools.startBackup")}
        </Button>
        {createBackupMutation.isSuccess && (
          <p className="mt-2 text-sm text-muted-foreground">{t("tools.queuedLargeTree")}</p>
        )}
      </div>

      {immichAvailable && (
        <div className="mt-6 border-t pt-6">
          <p className="text-sm text-muted-foreground">{t("tools.albumZipDescription")}</p>
          <div className="mt-4">
            <Button
              variant="outline"
              disabled={albumZipMutation.isPending}
              onClick={() => albumZipMutation.mutate()}
            >
              <DatabaseBackupIcon className="size-4" aria-hidden="true" />
              {albumZipMutation.isPending ? t("tools.queuing") : t("tools.downloadAllAlbums")}
            </Button>
            {albumZipMutation.isSuccess && (
              <p className="mt-2 text-sm text-muted-foreground">{t("tools.queuedLargeLibrary")}</p>
            )}
            {albumZipMutation.isError && (
              <p className="mt-2 text-sm text-destructive">
                {albumZipMutation.error instanceof Error
                  ? albumZipMutation.error.message
                  : t("tools.couldNotQueueDownload")}
              </p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function RestorePanel() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/database/restore", { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? t("tools.restoreFailedToStart"));
      }
    },
  });
  const isConfirmed = confirmationText === RESTORE_CONFIRMATION_TEXT;

  return (
    <SectionCard title={toolLabels(t).restore}>
      <p className="text-sm text-destructive">{t("tools.restoreWarning")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("tools.restoreUploadHint")}</p>

      <div className="mt-4 space-y-4">
        <FileDropZone
          allowsMultiple={false}
          label={t("tools.dropBackupFile")}
          onFilesSelected={([selected]) => setFile(selected ?? null)}
        />
        {file && <p className="text-sm">{t("tools.selected", { name: file.name })}</p>}

        <div className="space-y-1">
          <label htmlFor="restore-confirm" className="text-sm font-medium">
            {t("tools.typeToConfirm", { text: RESTORE_CONFIRMATION_TEXT })}
          </label>
          <Input
            id="restore-confirm"
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
          />
        </div>

        <Button
          variant="destructive"
          disabled={!file || !isConfirmed || restoreMutation.isPending}
          onClick={() => restoreMutation.mutate()}
        >
          <UploadIcon className="size-4" aria-hidden="true" />
          {restoreMutation.isPending ? t("tools.uploading") : t("tools.restoreDatabase")}
        </Button>
        {restoreMutation.isSuccess && (
          <p className="text-sm text-muted-foreground">{t("tools.restoreQueued")}</p>
        )}
        {restoreMutation.isError && (
          <p className="text-sm text-destructive">
            {restoreMutation.error instanceof Error
              ? restoreMutation.error.message
              : t("tools.restoreFailed")}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function FaceRescanPanel() {
  // Immich already detects faces automatically on every photo it ingests —
  // this exists for the cases that misses (a photo uploaded before face
  // recognition was enabled, or a face the first pass didn't catch). Queued
  // the same way as the backup job: this request just enqueues, and the
  // notification bell tells the user once every photo has been resubmitted
  // for detection — not once every face is actually tagged, since that part
  // happens in Immich's own background pipeline, outside this app's view.
  const { t } = useTranslation();
  const rescanMutation = useMutation({ mutationFn: rescanImmichFaces });

  return (
    <SectionCard title={toolLabels(t)["immich-faces"]}>
      <p className="text-sm text-muted-foreground">{t("tools.faceRescanDescription")}</p>
      <div className="mt-4">
        <Button disabled={rescanMutation.isPending} onClick={() => rescanMutation.mutate()}>
          <ScanFaceIcon className="size-4" aria-hidden="true" />
          {rescanMutation.isPending ? t("tools.starting") : t("tools.rescanForFaces")}
        </Button>
        {rescanMutation.isSuccess && (
          <p className="mt-2 text-sm text-muted-foreground">{t("tools.queuedLargeLibrary")}</p>
        )}
      </div>
    </SectionCard>
  );
}

function GedcomExportPanel() {
  const { t } = useTranslation();
  // Unlike backup/face-rescan, this returns the file directly instead of
  // queuing a job — a GEDCOM export is plain text, small enough at this
  // app's scale to build and send back within one request. 5.5.1 is the
  // default: it's still what most genealogy programs read best.
  const [version, setVersion] = useState<GedcomVersion>("5.5.1");
  const exportMutation = useMutation({
    mutationFn: async () => {
      const { gedcom } = await exportGedcom({ data: { version } });
      const blob = new Blob([gedcom], { type: "text/vnd.familysearch.gedcom" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = version === "7.0" ? "family-tree-gedcom7.ged" : "family-tree.ged";
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <SectionCard title={toolLabels(t)["gedcom-export"]}>
      <p className="text-sm text-muted-foreground">{t("tools.gedcomDescription")}</p>
      <div className="mt-4 space-y-1">
        <ButtonRadioGroup
          aria-label={t("tools.gedcomVersion")}
          value={version}
          onValueChange={setVersion}
          options={[
            { value: "5.5.1", label: t("tools.gedcomVersion551") },
            { value: "7.0", label: t("tools.gedcomVersion70") },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {version === "7.0" ? t("tools.gedcomVersion70Hint") : t("tools.gedcomVersion551Hint")}
        </p>
      </div>
      <div className="mt-4">
        <Button disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
          <FileDownIcon className="size-4" aria-hidden="true" />
          {exportMutation.isPending ? t("tools.exporting") : t("tools.exportGedcom")}
        </Button>
        {exportMutation.isError && (
          <p className="mt-2 text-sm text-destructive">
            {exportMutation.error instanceof Error
              ? exportMutation.error.message
              : t("tools.exportFailed")}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

/** Each language named in itself, as in the header's language menu. */
const SITE_LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "da", label: "Dansk" },
];

/**
 * The static family website export (see "Static family website" in
 * TECH_STACK.md): the whole tree as a zip of plain HTML pages plus the
 * interactive tree, to open offline or put on any web server. A queued job
 * like the backup — the notification bell says when the zip is ready.
 */
function FamilyWebsitePanel() {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const [title, setTitle] = useState(() => t("tools.familyWebsite.defaultTitle"));
  const [language, setLanguage] = useState<Language>(() => toSupportedLanguage(i18n.language));
  const [startPerson, setStartPerson] = useState<PersonListItem | null>(null);
  const exportMutation = useMutation({
    mutationFn: () =>
      createStaticSite({
        data: { title: title.trim(), language, startPersonId: startPerson?.id ?? null },
      }),
  });

  return (
    <SectionCard title={toolLabels(t)["family-website"]}>
      <p className="text-sm text-muted-foreground">{t("tools.familyWebsite.description")}</p>
      <p className="mt-3 rounded-md border-l-2 border-primary bg-muted px-3 py-2 text-sm">
        {t("tools.familyWebsite.privacy")}
      </p>
      <div className="mt-4 max-w-md space-y-4">
        <LabeledField label={t("tools.familyWebsite.title")}>
          <Input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </LabeledField>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{t("tools.familyWebsite.language")}</p>
          <ButtonRadioGroup
            aria-label={t("tools.familyWebsite.language")}
            value={language}
            onValueChange={setLanguage}
            options={SITE_LANGUAGES}
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{t("tools.familyWebsite.startPerson")}</p>
          {startPerson ? (
            <div className="flex items-center gap-2 text-sm">
              <span>{formatPersonWithLifespan(startPerson, formatName)}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("tools.familyWebsite.clearStartPerson")}
                onClick={() => setStartPerson(null)}
              >
                <XIcon className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <>
              <PersonPicker
                aria-label={t("tools.familyWebsite.startPerson")}
                onSelect={setStartPerson}
              />
              <p className="text-xs text-muted-foreground">
                {t("tools.familyWebsite.startPersonDefault")}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-4">
        <Button
          disabled={exportMutation.isPending || title.trim() === ""}
          onClick={() => exportMutation.mutate()}
        >
          <GlobeIcon className="size-4" aria-hidden="true" />
          {exportMutation.isPending ? t("tools.starting") : t("tools.familyWebsite.export")}
        </Button>
        {exportMutation.isSuccess && (
          <p className="mt-2 text-sm text-muted-foreground">{t("tools.familyWebsite.queued")}</p>
        )}
        {exportMutation.isError && (
          <p className="mt-2 text-sm text-destructive">
            {exportMutation.error instanceof Error
              ? exportMutation.error.message
              : t("tools.exportFailed")}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

/** Which of the preview's counts to show, in display order. */
const GEDCOM_IMPORT_COUNTS = [
  "persons",
  "names",
  "events",
  "parentLinks",
  "spouseLinks",
  "unions",
  "sources",
  "citations",
  "associations",
  "researchNotes",
  "places",
] as const;

function GedcomImportPanel() {
  // Two steps on purpose: preview (parse + report, writes nothing), then an
  // explicit import of exactly the file that was previewed. Everything is
  // added as new people — likely duplicates of people already in the tree
  // are listed, not merged — see "GEDCOM import" in TECH_STACK.md.
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<{ name: string; input: GedcomImportInput } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const previewMutation = useMutation({
    mutationFn: (input: GedcomImportInput) => previewGedcomImport({ data: input }),
  });
  const importMutation = useMutation({
    mutationFn: (input: GedcomImportInput) => importGedcom({ data: input }),
    // Hundreds of new people touch nearly every cached list in the app.
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const preview = previewMutation.data;

  const selectFile = async (selected: File | undefined): Promise<void> => {
    setFile(null);
    setReadError(null);
    previewMutation.reset();
    importMutation.reset();
    if (!selected) return;
    // Decoded here, not on the server: the browser has the raw bytes, and
    // what travels onward is plain text in a JSON body.
    const { text, encoding } = decodeGedcomBytes(new Uint8Array(await selected.arrayBuffer()));
    if (text.length > GEDCOM_IMPORT_MAX_CHARS) {
      setReadError(t("tools.gedcomImport.tooLarge"));
      return;
    }
    const input = { text, encoding };
    setFile({ name: selected.name, input });
    previewMutation.mutate(input);
  };

  return (
    <SectionCard title={toolLabels(t)["gedcom-import"]}>
      <p className="text-sm text-muted-foreground">{t("tools.gedcomImport.description")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("tools.gedcomImport.backupHint")}</p>

      <div className="mt-4 space-y-4">
        <FileDropZone
          allowsMultiple={false}
          acceptedFileTypes={[".ged", ".gedcom"]}
          isDisabled={importMutation.isPending}
          label={t("tools.gedcomImport.dropFile")}
          onFilesSelected={([selected]) => void selectFile(selected)}
        />
        {file && <p className="text-sm">{t("tools.selected", { name: file.name })}</p>}
        {readError && <p className="text-sm text-destructive">{readError}</p>}
        {previewMutation.isPending && (
          <p className="text-sm text-muted-foreground">{t("tools.gedcomImport.reading")}</p>
        )}
        {previewMutation.isError && (
          <p className="text-sm text-destructive">
            {previewMutation.error instanceof Error
              ? previewMutation.error.message
              : t("tools.gedcomImport.previewFailed")}
          </p>
        )}

        {preview && file && !importMutation.isSuccess && (
          <div className="space-y-6">
            {preview.header.sourceSystem && (
              <p className="text-sm text-muted-foreground">
                {t("tools.gedcomImport.exportedBy", {
                  system: preview.header.sourceSystem,
                  version: preview.header.version ?? "?",
                })}
              </p>
            )}

            <div>
              <h3 className="text-sm font-medium">{t("tools.gedcomImport.willAdd")}</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                {GEDCOM_IMPORT_COUNTS.map((key) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">
                      {t(`tools.gedcomImport.count.${key}`)}
                    </dt>
                    <dd className="font-medium tabular-nums">{preview.counts[key]}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {preview.warnings.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">{t("tools.gedcomImport.warnings")}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {preview.warnings.map((warning) => (
                    <li key={warning.code}>
                      {t(`tools.gedcomImport.warning.${warning.code}`, { count: warning.count })}
                      {warning.examples.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {warning.examples.join(", ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.unmappedEventTypes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">{t("tools.gedcomImport.unmappedTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("tools.gedcomImport.unmappedHint")}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {preview.unmappedEventTypes.map((type) => (
                    <li key={`${type.tag}|${type.label}`}>
                      {t("tools.gedcomImport.unmappedEntry", {
                        label: type.label,
                        count: type.count,
                      })}
                      {type.suggestedKey && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {t("tools.gedcomImport.unmappedSuggestion")}{" "}
                          <code className="rounded bg-muted px-1">{type.suggestedKey}</code>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {/* A new tab, so the selected file and this preview survive
                      the trip to Settings and back. */}
                  <Link
                    to="/settings"
                    search={{ topic: "event_type" }}
                    target="_blank"
                    className="text-sm text-primary hover:underline"
                  >
                    {t("tools.gedcomImport.openEventTypeSettings")}
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewMutation.isPending}
                    onClick={() => previewMutation.mutate(file.input)}
                  >
                    {t("tools.gedcomImport.checkAgain")}
                  </Button>
                </div>
              </div>
            )}

            <ReportSection
              title={t("tools.gedcomImport.possibleDuplicates", {
                count: preview.possibleDuplicateCount,
              })}
              isEmpty={preview.possibleDuplicateCount === 0}
            >
              {preview.possibleDuplicates.map((duplicate) => (
                <li key={duplicate.incoming.ref}>
                  {formatName(duplicate.incoming) || t("tools.unnamed")}
                  {duplicate.incoming.birth && ` (${duplicate.incoming.birth})`}
                  {" ↔ "}
                  {duplicate.existing.map((person, existingIndex) => (
                    <span key={person.id}>
                      {existingIndex > 0 && ", "}
                      <PersonLink personId={person.id} name={formatName(person)} />
                      {person.birth && ` (${person.birth})`}
                    </span>
                  ))}
                </li>
              ))}
            </ReportSection>
            {preview.possibleDuplicateCount > preview.possibleDuplicates.length && (
              <p className="text-sm text-muted-foreground">
                {t("tools.gedcomImport.moreDuplicates", {
                  count: preview.possibleDuplicateCount - preview.possibleDuplicates.length,
                })}
              </p>
            )}
            {preview.possibleDuplicateCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("tools.gedcomImport.duplicatesHint")}
              </p>
            )}

            <Button
              disabled={preview.counts.persons === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate(file.input)}
            >
              <FileUpIcon className="size-4" aria-hidden="true" />
              {importMutation.isPending
                ? t("tools.gedcomImport.importing")
                : t("tools.gedcomImport.importPeople", { count: preview.counts.persons })}
            </Button>
            {importMutation.isError && (
              <p className="text-sm text-destructive">
                {importMutation.error instanceof Error
                  ? importMutation.error.message
                  : t("tools.gedcomImport.importFailed")}
              </p>
            )}
          </div>
        )}

        {importMutation.isSuccess && (
          <p className="text-sm">
            {t("tools.gedcomImport.imported", { count: importMutation.data.persons })}{" "}
            <Link to="/people" className="text-primary hover:underline">
              {t("tools.gedcomImport.viewPeople")}
            </Link>
          </p>
        )}
      </div>
    </SectionCard>
  );
}

/** A person link shared by the report panels on this page — every finding here points back at a person page for the admin to actually look at and judge. */
function PersonLink({ personId, name }: { personId: string; name: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/people/$personId" params={{ personId }} className="text-primary hover:underline">
      {name || t("tools.unnamed")}
    </Link>
  );
}

/**
 * Everyone still marked living who was born longer ago than the Settings
 * page's "Presume deceased after" limit — typically people added by hand,
 * who default to living (the GEDCOM import already applies the rule). Run
 * on demand like the other checks; marking is one confirmed action, and a
 * single person can be marked living again on their own page.
 */
function PresumedDeceasedPanel() {
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const queryClient = useQueryClient();
  const checkMutation = useMutation({ mutationFn: getPresumedDeceased });
  const markMutation = useMutation({
    mutationFn: markPresumedDeceased,
    onSuccess: async () => {
      checkMutation.reset();
      await queryClient.invalidateQueries({ queryKey: ["person"] });
    },
  });
  const result = checkMutation.data;

  return (
    <SectionCard title={toolLabels(t)["presumed-deceased"]}>
      <p className="text-sm text-muted-foreground">{t("tools.presumedDeceased.description")}</p>
      <div className="mt-4">
        <Button disabled={checkMutation.isPending} onClick={() => checkMutation.mutate()}>
          {checkMutation.isPending ? t("tools.checking") : t("tools.presumedDeceased.check")}
        </Button>
      </div>
      {checkMutation.isError && (
        <p className="mt-2 text-sm text-destructive">{checkMutation.error.message}</p>
      )}
      {markMutation.isSuccess && (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("tools.presumedDeceased.marked", { count: markMutation.data.updated })}
        </p>
      )}
      {markMutation.isError && (
        <p className="mt-2 text-sm text-destructive">{markMutation.error.message}</p>
      )}
      {result && (
        <div className="mt-6 space-y-3">
          {result.afterYears === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tools.presumedDeceased.off")}</p>
          ) : result.people.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("tools.presumedDeceased.none", { years: result.afterYears })}
            </p>
          ) : (
            <>
              <p className="text-sm">
                {t("tools.presumedDeceased.found", {
                  count: result.people.length,
                  years: result.afterYears,
                })}
              </p>
              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
                {result.people.map((person) => (
                  <li key={person.id} className="flex justify-between gap-4">
                    <Link
                      to="/people/$personId"
                      params={{ personId: person.id }}
                      className="truncate hover:underline"
                    >
                      {formatName(person)}
                    </Link>
                    <span className="shrink-0 text-muted-foreground">
                      {formatDisplayDate(person.birth, language)}
                    </span>
                  </li>
                ))}
              </ul>
              <RemoveButton
                itemLabel={t("tools.presumedDeceased.itemLabel", { count: result.people.length })}
                title={t("tools.presumedDeceased.confirmTitle", { count: result.people.length })}
                description={t("tools.presumedDeceased.confirmDescription")}
                actionLabel={t("tools.presumedDeceased.confirmAction")}
                onConfirm={() => markMutation.mutate()}
                trigger={
                  <Button disabled={markMutation.isPending}>
                    {t("tools.presumedDeceased.markAll", { count: result.people.length })}
                  </Button>
                }
              />
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function DataIntegrityPanel() {
  // Run-on-demand, not on page load — same "button, then results" shape as
  // every other tool here, and these checks touch every citation/person row
  // (plus one Immich call per link), not worth doing on every visit.
  const { t, i18n } = useTranslation();
  const { formatName } = usePersonName();
  const language = toSupportedLanguage(i18n.language);
  const checkMutation = useMutation({ mutationFn: checkDataIntegrity });
  const report = checkMutation.data;

  return (
    <SectionCard title={toolLabels(t)["data-integrity"]}>
      <p className="text-sm text-muted-foreground">{t("tools.dataIntegrityDescription")}</p>
      <div className="mt-4">
        <Button disabled={checkMutation.isPending} onClick={() => checkMutation.mutate()}>
          <SearchCheckIcon className="size-4" aria-hidden="true" />
          {checkMutation.isPending ? t("tools.checking") : t("tools.runCheck")}
        </Button>
      </div>

      {report && (
        <div className="mt-6 space-y-6">
          <ReportSection
            title={t("tools.danglingCitations")}
            isEmpty={report.danglingCitations.length === 0}
          >
            {report.danglingCitations.map((citation) => (
              <li key={citation.citationId}>
                {t("tools.danglingCitationText", {
                  source: citation.sourceTitle,
                  factType: citation.factType,
                })}{" "}
                <PersonLink
                  personId={citation.personId}
                  name={formatName({
                    given: citation.personGiven,
                    surname: citation.personSurname,
                  })}
                />
              </li>
            ))}
          </ReportSection>

          {report.danglingImmichLinks && (
            <ReportSection
              title={t("tools.danglingImmichLinks")}
              isEmpty={report.danglingImmichLinks.length === 0}
            >
              {report.danglingImmichLinks.map((link) => (
                <li key={link.linkId}>
                  <PersonLink
                    personId={link.personId}
                    name={formatName({
                      given: link.personGiven,
                      surname: link.personSurname,
                    })}
                  />{" "}
                  {t("tools.danglingImmichLinkText")}
                </li>
              ))}
            </ReportSection>
          )}

          <ReportSection
            title={t("tools.recordAgeMismatches")}
            isEmpty={report.recordAgeMismatches.length === 0}
          >
            {report.recordAgeMismatches.map((mismatch) => (
              <li key={`${mismatch.recordId}:${mismatch.personId}`}>
                <PersonLink personId={mismatch.personId} name={formatName(mismatch.personName)} />{" "}
                {t("tools.recordAgeMismatchText", {
                  age: mismatch.age,
                  record: t(`records.type.${mismatch.recordType}`),
                  year: mismatch.year,
                  birth: formatDisplayDate(mismatch.birth, language),
                  years: Math.abs(mismatch.yearsOff),
                })}{" "}
                <Link
                  to="/records/$recordId"
                  params={{ recordId: mismatch.recordId }}
                  className="underline hover:text-foreground"
                >
                  {t("tools.recordAgeMismatchOpen")}
                </Link>
              </li>
            ))}
          </ReportSection>
        </div>
      )}
    </SectionCard>
  );
}

function GraphConsistencyPanel() {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const checkMutation = useMutation({ mutationFn: checkGraphConsistency });
  const report = checkMutation.data;

  return (
    <SectionCard title={toolLabels(t)["graph-consistency"]}>
      <p className="text-sm text-muted-foreground">{t("tools.graphConsistencyDescription")}</p>
      <div className="mt-4">
        <Button disabled={checkMutation.isPending} onClick={() => checkMutation.mutate()}>
          <SearchCheckIcon className="size-4" aria-hidden="true" />
          {checkMutation.isPending ? t("tools.checking") : t("tools.runCheck")}
        </Button>
      </div>

      {report && (
        <div className="mt-6 space-y-6">
          <ReportSection
            title={t("tools.peopleMissingGraphNode")}
            isEmpty={report.personsMissingGraphNode.length === 0}
          >
            {report.personsMissingGraphNode.map((person) => (
              <li key={person.id}>
                <PersonLink personId={person.id} name={formatName(person)} />
              </li>
            ))}
          </ReportSection>

          <ReportSection
            title={t("tools.orphanedGraphNodes")}
            isEmpty={report.orphanedGraphNodes.length === 0}
          >
            {report.orphanedGraphNodes.map((id) => (
              <li key={id} className="font-mono text-xs">
                {id}
              </li>
            ))}
          </ReportSection>
        </div>
      )}
    </SectionCard>
  );
}

function ReportSection({
  title,
  isEmpty,
  children,
}: {
  title: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {isEmpty ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("tools.noIssuesFound")}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{children}</ul>
      )}
    </div>
  );
}
