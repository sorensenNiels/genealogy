import type { SendMail } from "@genealogy/core";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { MAIL_QUEUE, MailService } from "./mail.service.js";

/**
 * The worker half of the mail queue — runs off the request that enqueued
 * the job, in this same Nest process (there's no separate worker
 * deployment here, matching this app's existing single-process shape).
 * BullMQ retries a thrown error on its own (see the queue's default job
 * options), so this deliberately doesn't catch anything itself.
 */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<SendMail>): Promise<void> {
    this.logger.log(`Sending mail job ${job.id} to ${job.data.to}`);
    await this.mail.sendNow(job.data);
  }

  // A job that exhausts its retries otherwise fails silently — BullMQ's own
  // Worker swallows the error, so without this nothing would ever print it.
  @OnWorkerEvent("failed")
  onFailed(job: Job<SendMail> | undefined, error: Error): void {
    this.logger.error(
      `Mail job ${job?.id} to ${job?.data.to} failed: ${error.message}`,
      error.stack,
    );
  }
}
