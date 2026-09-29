import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { IMMICH_FACE_SCAN_QUEUE, ImmichService, type RescanFacesJob } from "./immich.service.js";

/** The worker half of the face-rescan queue — see `BackupProcessor`/`MailProcessor` for the same shape and reasoning. */
@Processor(IMMICH_FACE_SCAN_QUEUE)
export class ImmichFaceScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ImmichFaceScanProcessor.name);

  constructor(private readonly immich: ImmichService) {
    super();
  }

  async process(job: Job<RescanFacesJob>): Promise<void> {
    this.logger.log(`Running Immich face re-scan job ${job.id} for user ${job.data.userId}`);
    await this.immich.rescanAllFaces(job.data.userId);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<RescanFacesJob> | undefined, error: Error): void {
    this.logger.error(`Immich face re-scan job ${job?.id} failed: ${error.message}`, error.stack);
  }
}
