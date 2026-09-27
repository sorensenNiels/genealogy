import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { BACKUP_QUEUE, BackupService, type CreateBackupJob } from "./backup.service.js";

/** The worker half of the backup queue — see `MailProcessor` for the same shape and reasoning. */
@Processor(BACKUP_QUEUE)
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(private readonly backups: BackupService) {
    super();
  }

  async process(job: Job<CreateBackupJob>): Promise<void> {
    this.logger.log(`Running backup job ${job.id} for user ${job.data.userId}`);
    await this.backups.createDump(job.data.userId);
  }

  // Without this, a thrown error inside `process` is handled entirely
  // inside BullMQ's own Worker — the job is marked failed in Redis, but
  // nothing prints anywhere, so a failure (a missing `pg_dump`, a version
  // mismatch, a full disk) looks identical to a job that's just still
  // running. This is what would have surfaced the pg_dump/server version
  // mismatch immediately instead of only a silent "no notification arrived".
  @OnWorkerEvent("failed")
  onFailed(job: Job<CreateBackupJob> | undefined, error: Error): void {
    this.logger.error(`Backup job ${job?.id} failed: ${error.message}`, error.stack);
  }
}
