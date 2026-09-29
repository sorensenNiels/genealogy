import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { ALBUM_ZIP_QUEUE, AlbumZipService, type GenerateAlbumZipJob } from "./album-zip.service.js";

/** The worker half of the album-zip queue — see `BackupProcessor` for the same shape and reasoning. */
@Processor(ALBUM_ZIP_QUEUE)
export class AlbumZipProcessor extends WorkerHost {
  private readonly logger = new Logger(AlbumZipProcessor.name);

  constructor(private readonly albumZips: AlbumZipService) {
    super();
  }

  async process(job: Job<GenerateAlbumZipJob>): Promise<void> {
    this.logger.log(`Running album-zip job ${job.id} for user ${job.data.userId}`);
    await this.albumZips.generateZips(job.data.userId, job.data.albumId);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<GenerateAlbumZipJob> | undefined, error: Error): void {
    this.logger.error(`Album-zip job ${job?.id} failed: ${error.message}`, error.stack);
  }
}
