import { createReadStream, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { z } from "zod";

import { AUTH, type Auth } from "../auth/auth.module.js";

/**
 * A raw REST endpoint, not tRPC — same reasoning as PersonPhotoController:
 * this streams a binary file, not JSON. Only the download side lives here
 * now; starting a backup is `backup.create` (tRPC, see backup.router.ts),
 * since that call itself no longer returns a file — it just enqueues a job
 * and returns immediately (see BackupService's comment for why).
 */
@Controller("database")
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly config: ConfigService,
  ) {}

  @Get("backup/:id")
  async download(
    @Param("id") rawId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new UnauthorizedException();
    }

    // `rawId` becomes a filesystem path below, and it's caller-supplied —
    // validated as a bare UUID first so there's no path-traversal surface
    // (a `../` or an absolute path) onto BACKUPS_DIR.
    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) {
      throw new BadRequestException("Invalid backup id");
    }

    const dir = this.config.getOrThrow<string>("BACKUPS_DIR");
    const path = join(dir, `${parsed.data}.sql.gz`);
    if (!existsSync(path)) {
      throw new NotFoundException(
        "Backup not found — it may already have been downloaded, or hasn't finished generating yet.",
      );
    }

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="genealogy-backup-${parsed.data}.sql.gz"`,
    );
    const stream = createReadStream(path);
    stream.pipe(res);
    // One-shot by design: a backup is only ever downloaded once its
    // notification is acted on, so there's no retention policy to build —
    // the file is cleaned up here instead of piling up in BACKUPS_DIR.
    stream.on("close", () => {
      rm(path, { force: true }).catch((error: unknown) => {
        this.logger.error(`Failed to remove backup file after download: ${String(error)}`);
      });
    });
  }
}
