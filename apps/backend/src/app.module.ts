import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module.js";
import { validateEnv } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { TrpcModule } from "./trpc/trpc.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Refuses to boot on a bad environment instead of failing on first query.
      validate: validateEnv,
    }),
    DatabaseModule,
    QueueModule,
    AuthModule,
    TrpcModule,
  ],
})
export class AppModule {}
