import { createDatabase, createPool, type Database } from "@genealogy/db";
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Pool } from "pg";

export const PG_POOL = "PG_POOL";
export const DRIZZLE = "DRIZZLE";

/**
 * Global because both halves of the store — Drizzle for tables, Cypher for the
 * graph — are needed by most feature modules, and because they must share one
 * pool for a write to be able to span both in a single transaction.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => createPool(config.getOrThrow("DATABASE_URL")),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => createDatabase(pool),
    },
  ],
  exports: [PG_POOL, DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
