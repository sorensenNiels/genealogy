import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

const LOCK_KEY = "db-operation-lock";
// Generous ceiling for a big pg_dump/psql run against a large tree — an
// auto-expiring TTL rather than no expiry at all, so a crashed worker that
// never reaches `release()` doesn't wedge every future backup/restore
// permanently.
const LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * A simple Redis mutex so a backup and a restore (or two of either) never
 * run at once against the same live database — there's no other
 * lock/maintenance-mode mechanism in this app, and `pg_dump`/`psql` both
 * connect to `DATABASE_URL` directly, outside the shared connection pool
 * (`PG_POOL`), so nothing else would stop them colliding. Callers fail fast
 * rather than queueing behind the lock — see `BackupProcessor`/
 * `RestoreProcessor`.
 *
 * A dedicated `ioredis` client, not the one `QueueModule` holds internally
 * for BullMQ — that connection isn't exported as an injectable token, and a
 * second lightweight connection for this is cheap.
 */
@Injectable()
export class DbOperationLockService implements OnApplicationShutdown {
  private readonly logger = new Logger(DbOperationLockService.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow("REDIS_URL"));
  }

  async acquire(): Promise<void> {
    const result = await this.redis.set(LOCK_KEY, "1", "PX", LOCK_TTL_MS, "NX");
    if (result === null) {
      this.logger.warn("Refused to start: another backup or restore is already running");
      throw new Error("Another backup or restore is already running — try again once it finishes.");
    }
  }

  async release(): Promise<void> {
    await this.redis.del(LOCK_KEY);
  }

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
  }
}
