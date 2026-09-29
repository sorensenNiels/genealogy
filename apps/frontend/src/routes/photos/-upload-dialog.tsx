import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FileDropZone } from "@genealogy/ui/components/file-drop-zone";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { ProgressBar } from "@genealogy/ui/components/progress-bar";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Mirrors apps/backend's own cap (`IMMICH_MAX_UPLOAD_BYTES`, 50MB default) — a client-side pre-check, not the source of truth. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/**
 * One at a time, not several in parallel — direct testing against Immich,
 * the same-album write path, and this app's own proxy all held up fine
 * under concurrency in isolation, so the most likely remaining cause of
 * "many fail when uploading a batch, none fail one at a time" is several
 * large uploads competing for the same (often modest, real-world) upload
 * bandwidth. Serializing removes that contention outright rather than
 * guessing at a lower concurrency number.
 */
const UPLOAD_CONCURRENCY = 1;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UploadItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "duplicate" | "failed";
  error?: string;
  assetId?: string;
}

export interface UploadResult {
  assetId: string;
  isDuplicate: boolean;
}

export function UploadDialog({
  albumId,
  trigger,
  onUploaded,
}: {
  /** Present → uploads land in this album (via the same request Immich's own `POST /assets` doesn't take an album for). */
  albumId?: string;
  trigger: ReactNode;
  onUploaded: (results: UploadResult[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <FormDialog trigger={trigger} title={t("upload.title")}>
      {(close) => (
        <UploadForm
          {...(albumId ? { albumId } : {})}
          onDone={async (results) => {
            close();
            await onUploaded(results);
          }}
        />
      )}
    </FormDialog>
  );
}

function UploadForm({
  albumId,
  onDone,
}: {
  albumId?: string;
  onDone: (results: UploadResult[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = (files: File[]): void => {
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({ id: crypto.randomUUID(), file, status: "queued" as const })),
    ]);
  };

  const isFinished =
    items.length > 0 &&
    items.every((item) => item.status !== "queued" && item.status !== "uploading");
  const doneCount = items.filter(
    (item) => item.status !== "queued" && item.status !== "uploading",
  ).length;

  const attemptUpload = async (file: File): Promise<UploadResult> => {
    const form = new FormData();
    form.set("file", file);
    if (albumId) form.set("albumId", albumId);
    const response = await fetch("/api/immich/upload", { method: "POST", body: form });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? t("upload.uploadFailed", { status: response.status }));
    }
    return (await response.json()) as UploadResult;
  };

  const uploadOne = async (id: string, file: File): Promise<void> => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "uploading" } : it)));

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await attemptUpload(file);
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: result.isDuplicate ? "duplicate" : "done",
                  assetId: result.assetId,
                }
              : it,
          ),
        );
        return;
      } catch (error) {
        lastError = error;
        const delay = RETRY_DELAYS_MS[attempt - 1];
        if (delay !== undefined) await sleep(delay);
      }
    }

    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              status: "failed",
              error: lastError instanceof Error ? lastError.message : String(lastError),
            }
          : it,
      ),
    );
  };

  const startUpload = async (): Promise<void> => {
    setIsUploading(true);
    const queue = items.filter((item) => item.status === "queued");
    let cursor = 0;

    // A bounded worker pool, not a single sequential pass: each worker below
    // awaits one upload at a time by design (that's what limits how many
    // requests are in flight at once) — running `UPLOAD_CONCURRENCY` of them
    // concurrently via `Promise.all` is what actually parallelizes the batch.
    async function worker(): Promise<void> {
      while (cursor < queue.length) {
        const next = queue[cursor];
        cursor += 1;
        if (next) {
          await uploadOne(next.id, next.file);
        }
      }
    }

    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()));
    setIsUploading(false);
  };

  const finish = async (): Promise<void> => {
    const results = items
      .filter((item): item is UploadItem & { assetId: string } => item.assetId !== undefined)
      .map((item) => ({ assetId: item.assetId, isDuplicate: item.status === "duplicate" }));
    await onDone(results);
  };

  return (
    <div className="space-y-3">
      <FileDropZone
        onFilesSelected={addFiles}
        acceptedFileTypes={["image/*", "video/*"]}
        maxBytes={MAX_UPLOAD_BYTES}
        isDisabled={isUploading}
      />

      {items.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <StatusIcon status={item.status} />
              <span className="flex-1 truncate">{item.file.name}</span>
              {item.status === "duplicate" && (
                <span className="text-xs text-muted-foreground">
                  {t("upload.alreadyInLibrary")}
                </span>
              )}
              {item.status === "failed" && (
                <span className="text-xs text-destructive">{item.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {isUploading && (
        <ProgressBar
          label={t("upload.uploadingProgress", { done: doneCount, total: items.length })}
          value={(doneCount / items.length) * 100}
        />
      )}

      <DialogFooter>
        {isFinished ? (
          <Button onPress={() => void finish()}>{t("upload.done")}</Button>
        ) : (
          // Not `SaveButton`: this dialog has no clean/dirty form baseline to
          // diff against — it's a picker-then-run-a-batch-job flow, the same
          // reasoning CitationForm's own comment gives for staying a plain
          // Button.
          <Button isDisabled={items.length === 0 || isUploading} onPress={() => void startUpload()}>
            {isUploading ? t("upload.uploading") : t("upload.uploadCount", { count: items.length })}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function StatusIcon({ status }: { status: UploadItem["status"] }) {
  switch (status) {
    case "done":
    case "duplicate":
      return <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />;
    case "failed":
      return <XIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />;
    case "uploading":
      return (
        <Loader2Icon
          className="size-4 shrink-0 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      );
    case "queued":
      return <span className="size-4 shrink-0" aria-hidden="true" />;
  }
}
