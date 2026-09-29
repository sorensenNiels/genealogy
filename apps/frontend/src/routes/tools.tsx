import { formatPersonName } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { FileDropZone } from "@genealogy/ui/components/file-drop-zone";
import { Input } from "@genealogy/ui/components/input";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  DatabaseBackupIcon,
  FileDownIcon,
  ScanFaceIcon,
  SearchCheckIcon,
  UploadIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { createBackup } from "../server/functions/backup.functions";
import { exportGedcom } from "../server/functions/gedcom.functions";
import {
  enqueueAllAlbumsZip,
  isImmichConfigured,
  rescanImmichFaces,
} from "../server/functions/immich.functions";
import { checkDataIntegrity, checkGraphConsistency } from "../server/functions/integrity.functions";

const TOOLS = [
  "backup",
  "restore",
  "immich-faces",
  "gedcom-export",
  "data-integrity",
  "graph-consistency",
] as const;
type Tool = (typeof TOOLS)[number];

function toolLabels(t: TFunction): Record<Tool, string> {
  return {
    backup: t("tools.tool.backup"),
    restore: t("tools.tool.restore"),
    "immich-faces": t("tools.tool.immich-faces"),
    "gedcom-export": t("tools.tool.gedcom-export"),
    "data-integrity": t("tools.tool.data-integrity"),
    "graph-consistency": t("tools.tool.graph-consistency"),
  };
}

const RESTORE_CONFIRMATION_TEXT = "RESTORE";

export const Route = createFileRoute("/tools")({
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
  // for infrastructure that isn't configured.
  const immichConfigured = useQuery({
    queryKey: ["immich", "isConfigured"],
    queryFn: () => isImmichConfigured(),
  });
  const visibleTools = TOOLS.filter((option) => option !== "immich-faces" || immichConfigured.data);

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
        </SectionCard>
        {tool === "backup" && <BackupPanel />}
        {tool === "restore" && <RestorePanel />}
        {tool === "immich-faces" && immichConfigured.data && <FaceRescanPanel />}
        {tool === "gedcom-export" && <GedcomExportPanel />}
        {tool === "data-integrity" && <DataIntegrityPanel />}
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
  // Same query key `ToolsRoute` already fetches, so this reuses that cache
  // rather than firing a second request — Immich is opt-in infrastructure,
  // so the photo-backup button only makes sense to offer when it's there.
  const immichConfigured = useQuery({
    queryKey: ["immich", "isConfigured"],
    queryFn: () => isImmichConfigured(),
  });

  return (
    <SectionCard title={toolLabels(t).backup}>
      <p className="text-sm text-muted-foreground">{t("tools.backupDescription")}</p>
      <div className="mt-4">
        <Button
          isDisabled={createBackupMutation.isPending}
          onPress={() => createBackupMutation.mutate()}
        >
          <DatabaseBackupIcon className="size-4" aria-hidden="true" />
          {createBackupMutation.isPending ? t("tools.starting") : t("tools.startBackup")}
        </Button>
        {createBackupMutation.isSuccess && (
          <p className="mt-2 text-sm text-muted-foreground">{t("tools.queuedLargeTree")}</p>
        )}
      </div>

      {immichConfigured.data && (
        <div className="mt-6 border-t pt-6">
          <p className="text-sm text-muted-foreground">{t("tools.albumZipDescription")}</p>
          <div className="mt-4">
            <Button
              variant="outline"
              isDisabled={albumZipMutation.isPending}
              onPress={() => albumZipMutation.mutate()}
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
          isDisabled={!file || !isConfirmed || restoreMutation.isPending}
          onPress={() => restoreMutation.mutate()}
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
        <Button isDisabled={rescanMutation.isPending} onPress={() => rescanMutation.mutate()}>
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
  // app's scale to build and send back within one request.
  const exportMutation = useMutation({
    mutationFn: async () => {
      const { gedcom } = await exportGedcom();
      const blob = new Blob([gedcom], { type: "text/vnd.familysearch.gedcom" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "family-tree.ged";
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <SectionCard title={toolLabels(t)["gedcom-export"]}>
      <p className="text-sm text-muted-foreground">{t("tools.gedcomDescription")}</p>
      <div className="mt-4">
        <Button isDisabled={exportMutation.isPending} onPress={() => exportMutation.mutate()}>
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

/** A person link shared by both report panels below — every finding here points back at a person page for the admin to actually look at and judge. */
function PersonLink({ personId, name }: { personId: string; name: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/people/$personId" params={{ personId }} className="text-primary hover:underline">
      {name || t("tools.unnamed")}
    </Link>
  );
}

function DataIntegrityPanel() {
  // Run-on-demand, not on page load — same "button, then results" shape as
  // every other tool here, and these checks touch every citation/person row
  // (plus one Immich call per link), not worth doing on every visit.
  const { t } = useTranslation();
  const checkMutation = useMutation({ mutationFn: checkDataIntegrity });
  const report = checkMutation.data;

  return (
    <SectionCard title={toolLabels(t)["data-integrity"]}>
      <p className="text-sm text-muted-foreground">{t("tools.dataIntegrityDescription")}</p>
      <div className="mt-4">
        <Button isDisabled={checkMutation.isPending} onPress={() => checkMutation.mutate()}>
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
                  name={formatPersonName({
                    given: citation.personGiven,
                    surname: citation.personSurname,
                  })}
                />
              </li>
            ))}
          </ReportSection>

          <ReportSection
            title={t("tools.possibleDuplicates")}
            isEmpty={report.possibleDuplicates.length === 0}
          >
            {report.possibleDuplicates.map((group) => (
              <li key={`${group.given}|${group.surname}`}>
                {group.people.map((person, index) => (
                  <span key={person.id}>
                    {index > 0 && ", "}
                    <PersonLink personId={person.id} name={formatPersonName(person)} />
                  </span>
                ))}
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
                    name={formatPersonName({
                      given: link.personGiven,
                      surname: link.personSurname,
                    })}
                  />{" "}
                  {t("tools.danglingImmichLinkText")}
                </li>
              ))}
            </ReportSection>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function GraphConsistencyPanel() {
  const { t } = useTranslation();
  const checkMutation = useMutation({ mutationFn: checkGraphConsistency });
  const report = checkMutation.data;

  return (
    <SectionCard title={toolLabels(t)["graph-consistency"]}>
      <p className="text-sm text-muted-foreground">{t("tools.graphConsistencyDescription")}</p>
      <div className="mt-4">
        <Button isDisabled={checkMutation.isPending} onPress={() => checkMutation.mutate()}>
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
                <PersonLink personId={person.id} name={formatPersonName(person)} />
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
