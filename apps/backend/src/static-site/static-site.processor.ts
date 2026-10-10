import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import {
  STATIC_SITE_QUEUE,
  StaticSiteService,
  type GenerateStaticSiteJob,
} from "./static-site.service.js";

/** The worker half of the static-site queue — see `BackupProcessor` for the same shape and reasoning. */
@Processor(STATIC_SITE_QUEUE)
export class StaticSiteProcessor extends WorkerHost {
  private readonly logger = new Logger(StaticSiteProcessor.name);

  constructor(private readonly staticSites: StaticSiteService) {
    super();
  }

  async process(job: Job<GenerateStaticSiteJob>): Promise<void> {
    this.logger.log(`Running static-site job ${job.id} for user ${job.data.userId}`);
    await this.staticSites.generate(job.data.userId, job.data.options);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<GenerateStaticSiteJob> | undefined, error: Error): void {
    this.logger.error(`Static-site job ${job?.id} failed: ${error.message}`, error.stack);
  }
}
