import { createReadStream, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { diskStorage } from "multer";
import { z } from "zod";

import { AUTH, type Auth } from "../auth/auth.module.js";
import { RestoreService } from "./restore.service.js";

/**
 * A raw REST endpoint, not tRPC — same reasoning as PersonPhotoController:
 * this streams binary files, not JSON. Downloading a finished backup is
 * `GET /database/backup/:id`; starting one is `backup.create` (tRPC, see
 * backup.router.ts), since that call itself no longer returns a file — it
 * just enqueues a job and returns immediately (see BackupService's comment
 * for why). Uploading a file to restore from lives here too, for the same
 * "doesn't fit tRPC's JSON contract" reason the Immich upload route does.
 */
@Controller("database")
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly config: ConfigService,
    private readonly restores: RestoreService,
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

  /**
   * Uploads a previously-downloaded `.sql.gz` backup file to restore from.
   * `diskStorage`, not the `FileInterceptor` default of memory storage —
   * same reasoning as `ImmichAssetController.uploadAsset`, just a much
   * larger file this time. Into `tmpdir()`, not `BACKUPS_DIR` — this is a
   * re-uploaded file being restored *from*, not a finished backup waiting
   * to be downloaded, and mixing the two would be confusing. The interceptor's
   * own `limits.fileSize` is a fixed, generous hard ceiling for the same
   * reason `ImmichAssetController`'s is: Nest decorators run before
   * `ConfigService` exists, so the actual configurable cap
   * (`RESTORE_MAX_UPLOAD_BYTES`) is enforced afterward, in the handler.
   */
  @Post("restore")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: 1024 * 1024 * 1024 },
    }),
  )
  async restore(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new UnauthorizedException();
    }
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!file.originalname.endsWith(".sql.gz")) {
      await rm(file.path, { force: true });
      throw new BadRequestException("Expected a .sql.gz backup file");
    }
    const maxBytes = this.config.getOrThrow<number>("RESTORE_MAX_UPLOAD_BYTES");
    if (file.size > maxBytes) {
      await rm(file.path, { force: true });
      throw new BadRequestException(`File exceeds the ${Math.round(maxBytes / 1_000_000)}MB limit`);
    }

    await this.restores.enqueueRestore(file.path, session.user.id);
    res.json({ queued: true });
  }
}
