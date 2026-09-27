import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createGzip } from "node:zlib";

import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";

import { NotificationService } from "../notification/notification.service.js";

export const BACKUP_QUEUE = "backup";
export const CREATE_BACKUP_JOB = "create";

export interface CreateBackupJob {
  userId: string;
}

/**
 * Owns the actual `pg_dump` work and the notification it ends in;
 * `BackupRouter` only enqueues, `BackupProcessor` calls `createDump` once
 * BullMQ hands the job to a worker — same split as `MailService`/
 * `MailProcessor`.
 *
 * A dump now goes to a file under `BACKUPS_DIR` instead of streaming
 * straight to the HTTP response that requested it (the shape the old
 * synchronous `/database/backup` endpoint used): `pg_dump` against a large
 * tree can run long enough that holding a request/response open for it
 * isn't reasonable, so the request just enqueues and returns immediately,
 * and `BackupController.download` serves the finished file once
 * `NotificationService` has told the browser it's ready.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @InjectQueue(BACKUP_QUEUE) private readonly queue: Queue<CreateBackupJob>,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  async enqueueBackup(userId: string): Promise<void> {
    await this.queue.add(CREATE_BACKUP_JOB, { userId });
  }

  /** Called only by `BackupProcessor`. Throws on failure — left to BullMQ's own retry, same as `MailProcessor`. */
  async createDump(userId: string): Promise<void> {
    const dir = this.config.getOrThrow<string>("BACKUPS_DIR");
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const path = join(dir, `${id}.sql.gz`);
    this.logger.log(`Generating backup ${id} for user ${userId}`);

    try {
      await this.dumpTo(path);
    } catch (error) {
      // A partial file from a `pg_dump` that failed partway through would
      // otherwise sit in BACKUPS_DIR forever — nothing else ever looks at
      // it (`BackupController.download` only reads a path a notification
      // pointed at, and no notification gets created below).
      await rm(path, { force: true });
      throw error;
    }

    await this.notifications.create({
      userId,
      type: "backup_ready",
      title: "Database backup ready",
      body: "Your requested backup has finished generating and is ready to download.",
      // A frontend route (proxied through to BackupController.download),
      // not this backend's own path — see "The proxy architecture" in
      // CLAUDE.md: the browser only ever talks to apps/frontend's origin.
      actionUrl: `/api/database/backup/${id}`,
    });
  }

  /** Plain SQL rather than pg_dump's custom format — restorable with a plain `psql < file`, no `pg_restore` required, and still small once gzipped. */
  private dumpTo(path: string): Promise<void> {
    const databaseUrl = this.config.getOrThrow<string>("DATABASE_URL");
    return new Promise<void>((resolve, reject) => {
      const pgDump = spawn("pg_dump", ["--format=plain", "--no-owner", databaseUrl]);
      const out = createWriteStream(path);
      let stderr = "";
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const succeed = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      pgDump.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      pgDump.on("error", (error) => fail(new Error(`pg_dump failed to start: ${error.message}`)));
      pgDump.on("close", (code) => {
        if (code !== 0) {
          fail(new Error(`pg_dump exited with code ${code}: ${stderr}`));
        }
      });
      out.on("error", fail);
      out.on("finish", succeed);

      pgDump.stdout.pipe(createGzip()).pipe(out);
    });
  }
}
