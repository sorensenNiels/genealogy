import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MailTemplate, SendMail } from "@genealogy/core";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import Handlebars from "handlebars";
import { createTransport, type Transporter } from "nodemailer";

// Resolved at runtime (fs, not an import) so it works the same whether this
// file is running as compiled JS in dist/mail or as source under src/mail
// via `nest start` — see nest-cli.json's `assets` entry, which copies the
// .hbs files into dist alongside the compiled JS they sit next to here.
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "templates");

/** "send this mail" — what `MailProcessor` actually receives as job data. */
export const MAIL_QUEUE = "mail";
export const SEND_MAIL_JOB = "send";

/**
 * Owns the SMTP transport and Handlebars rendering; `MailQueueRouter`
 * enqueues, `MailProcessor` calls `sendNow` once BullMQ hands the job to a
 * worker. Split from the processor the same way `SettingsService` is split
 * from `SettingsRouter` — this class has no BullMQ-specific code in it and
 * could be unit-tested without a queue at all.
 *
 * `SMTP_HOST` is optional config (see env.ts), same pattern as
 * `IMMICH_URL`/`IMMICH_API_KEY`: without it, `nodemailer`'s `jsonTransport`
 * stands in, which never opens a network connection and instead hands back
 * the fully rendered message as a JSON string — logged here at info level,
 * so a job still "succeeds" and is inspectable in dev without a real mail
 * provider configured.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly configured: boolean;
  private readonly compiledTemplates = new Map<MailTemplate, HandlebarsTemplateDelegate>();

  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue<SendMail>,
    config: ConfigService,
  ) {
    this.from = config.getOrThrow("MAIL_FROM");
    const host = config.get<string>("SMTP_HOST");
    this.configured = host != null;
    this.transporter = this.configured
      ? createTransport({
          host,
          port: config.getOrThrow("SMTP_PORT"),
          secure: config.getOrThrow("SMTP_PORT") === 465,
          auth: config.get<string>("SMTP_USER")
            ? { user: config.get<string>("SMTP_USER"), pass: config.get<string>("SMTP_PASS") }
            : undefined,
        })
      : createTransport({ jsonTransport: true });
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /** Enqueues the job; the actual send happens later, off the request, in `MailProcessor`. */
  async enqueueMail(input: SendMail): Promise<void> {
    await this.queue.add(SEND_MAIL_JOB, input);
  }

  /** Renders `input.template` with `input.context` and hands the result to the transport. Called only by `MailProcessor`. */
  async sendNow(input: SendMail): Promise<void> {
    const html = await this.render(input.template, input.context);
    const info = await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html,
    });
    if (!this.isConfigured()) {
      this.logger.log(`No SMTP_HOST configured — mail logged instead of sent: ${info.message}`);
    }
  }

  private async render(template: MailTemplate, context: Record<string, unknown>): Promise<string> {
    let compiled = this.compiledTemplates.get(template);
    if (!compiled) {
      const source = await readFile(join(TEMPLATES_DIR, `${template}.hbs`), "utf8");
      compiled = Handlebars.compile(source);
      this.compiledTemplates.set(template, compiled);
    }
    return compiled(context);
  }
}
