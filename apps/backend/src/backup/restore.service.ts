import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { createGunzip } from "node:zlib";

import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";

import { NotificationService } from "../notification/notification.service.js";
import { DbOperationLockService } from "./db-operation-lock.service.js";

export const RESTORE_QUEUE = "restore";
export const RESTORE_JOB = "restore";

export interface RestoreJob {
  filePath: string;
  userId: string;
}

/**
 * The inverse of `BackupService.dumpTo`, in the same two parts: the
 * relational half restores cleanly because `dumpTo` dumped it with `--clean
 * --if-exists`; the Apache AGE graph half is data-only (Apache AGE blocks
 * plain DDL against its own label tables — see `dumpTo`'s comment), so it's
 * cleared with a `TRUNCATE` here first, then repopulated from the dump. Both
 * run against the same live `DATABASE_URL` the whole app already runs
 * against, via plain `psql`.
 *
 * Deliberately does not attempt to pause or drain the app's own request
 * traffic during a restore — there's no maintenance-mode mechanism in this
 * app, and building one was judged more machinery than a self-hosted,
 * single-family tool needs. `DbOperationLockService` only prevents two
 * backup/restore jobs from overlapping *each other*; ordinary concurrent
 * app usage during a restore is a known, accepted risk, called out
 * explicitly in the Tools page's own warning copy.
 */
@Injectable()
export class RestoreService {
  private readonly logger = new Logger(RestoreService.name);

  constructor(
    @InjectQueue(RESTORE_QUEUE) private readonly queue: Queue<RestoreJob>,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly lock: DbOperationLockService,
  ) {}

  async enqueueRestore(filePath: string, userId: string): Promise<void> {
    await this.queue.add(RESTORE_JOB, { filePath, userId });
  }

  /** Called only by `RestoreProcessor`. Throws on failure — left to BullMQ's own retry, same as `BackupProcessor`. */
  async restoreFrom(filePath: string, userId: string): Promise<void> {
    await this.lock.acquire();
    this.logger.log(`Restoring database from ${filePath} for user ${userId}`);
    try {
      await this.restore(filePath);
      await this.notifications.create({
        userId,
        type: "restore_complete",
        title: "Database restore finished",
        body: "The database has been restored from the file you uploaded.",
      });
    } catch (error) {
      // Unlike `BackupProcessor` (which only logs a failure), a failed
      // restore is important enough that the admin shouldn't have to check
      // server logs to learn the database might be in a half-restored
      // state.
      await this.notifications.create({
        userId,
        type: "restore_complete",
        title: "Database restore failed",
        body: error instanceof Error ? error.message : "Restore failed for an unknown reason.",
      });
      throw error;
    } finally {
      await this.lock.release();
      await rm(filePath, { force: true });
    }
  }

  private async restore(filePath: string): Promise<void> {
    const databaseUrl = this.config.getOrThrow<string>("DATABASE_URL");
    // The dump's `family_tree` half is data-only (see `BackupService.dumpTo`'s
    // comment for why it can't be `--clean` — Apache AGE blocks plain DDL on
    // its own label tables). A data-only dump only ever adds rows, so the
    // graph tables need clearing first — `TRUNCATE`, unlike `DROP`/`CREATE`,
    // is one of the few things AGE actually permits directly against them
    // (confirmed live against the local sandbox).
    await this.runPsql(databaseUrl, (psql) => {
      psql.stdin.write(
        "LOAD 'age';\nTRUNCATE family_tree._ag_label_vertex, family_tree._ag_label_edge;\n",
      );
      psql.stdin.end();
    });
    await this.runPsql(databaseUrl, (psql) => {
      const source = createReadStream(filePath).pipe(createGunzip());
      source.on("error", (error) => {
        psql.stdin.destroy(new Error(`Could not read the uploaded file: ${error.message}`));
      });
      source.pipe(psql.stdin);
    });
  }

  private runPsql(
    databaseUrl: string,
    feed: (psql: ChildProcessWithoutNullStreams) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const psql = spawn("psql", ["--set=ON_ERROR_STOP=on", databaseUrl]);
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

      psql.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      psql.on("error", (error) => fail(new Error(`psql failed to start: ${error.message}`)));
      psql.on("close", (code) => {
        if (code !== 0) {
          fail(new Error(`psql exited with code ${code}: ${stderr}`));
        } else {
          succeed();
        }
      });

      feed(psql);
    });
  }
}
