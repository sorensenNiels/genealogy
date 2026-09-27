import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

/**
 * Wires BullMQ to the shared Redis instance (`REDIS_URL` — see
 * "Long-running work: BullMQ + a shared Redis" in TECH_STACK.md; the same
 * Redis Immich uses when its own profile is enabled). Global, like
 * DatabaseModule/AuthModule, so any feature module can
 * `BullModule.registerQueue({ name: "..." })` for its own queue without
 * importing this module directly.
 *
 * A single shared `ioredis` connection, not per-queue connection options:
 * BullMQ multiplexes several queues/workers over one connection fine, and
 * this avoids opening a new TCP connection per queue registered.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: new Redis(config.getOrThrow("REDIS_URL"), {
          // BullMQ's workers block on this connection waiting for jobs;
          // without this, ioredis gives up retrying after a transient
          // Redis hiccup instead of reconnecting indefinitely.
          maxRetriesPerRequest: null,
        }),
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
