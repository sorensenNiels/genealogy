import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";

import { AppModule } from "./app.module.js";
import { AUTH, type Auth } from "./auth/auth.module.js";
import { corsOrigins } from "./config/env.js";
import { TrpcRouter } from "./trpc/trpc.router.js";

async function bootstrap(): Promise<void> {
  // better-auth reads the raw request stream itself; Nest's default body
  // parser would consume it first. tRPC's Express adapter parses the body
  // itself when req.body is still undefined, so turning this off doesn't
  // affect /trpc.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);

  app.enableCors({
    origin: corsOrigins(config.getOrThrow<string>("CORS_ORIGINS")),
    credentials: true,
  });

  // Lets DatabaseModule close the pg pool on SIGTERM.
  app.enableShutdownHooks();

  // Mounted before tRPC, and via the raw Express instance rather than
  // INestApplication.use: better-auth's own docs mount with app.all (method-
  // agnostic route matching, not INestApplication's use-only passthrough) at
  // its default /api/auth base path. Express 5's wildcard syntax requires a
  // named segment (*splat), unlike Express 4's bare *.
  app
    .getHttpAdapter()
    .getInstance()
    .all("/api/auth/*splat", toNodeHandler(app.get<Auth>(AUTH)));

  app.get(TrpcRouter).applyMiddleware(app);

  const port = config.getOrThrow<number>("PORT");
  // 0.0.0.0, not localhost: inside a container the port must be reachable from
  // outside the network namespace.
  await app.listen(port, "0.0.0.0");

  Logger.log(`API listening on http://localhost:${port}/trpc`, "Bootstrap");
}

await bootstrap();
