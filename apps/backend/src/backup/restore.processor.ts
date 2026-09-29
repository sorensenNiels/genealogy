import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { RESTORE_QUEUE, RestoreService, type RestoreJob } from "./restore.service.js";

/** The worker half of the restore queue — see `BackupProcessor` for the same shape and reasoning. */
@Processor(RESTORE_QUEUE)
export class RestoreProcessor extends WorkerHost {
  private readonly logger = new Logger(RestoreProcessor.name);

  constructor(private readonly restores: RestoreService) {
    super();
  }

  async process(job: Job<RestoreJob>): Promise<void> {
    this.logger.log(`Running restore job ${job.id} for user ${job.data.userId}`);
    await this.restores.restoreFrom(job.data.filePath, job.data.userId);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<RestoreJob> | undefined, error: Error): void {
    this.logger.error(`Restore job ${job?.id} failed: ${error.message}`, error.stack);
  }
}
