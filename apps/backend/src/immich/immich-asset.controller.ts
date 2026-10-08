import { createReadStream, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { diskStorage } from "multer";
import { z } from "zod";

import { AUTH, type Auth } from "../auth/auth.module.js";
import { requireRole } from "../auth/require-role.js";
import { ImmichService, type UploadedImmichFile } from "./immich.service.js";

/**
 * A REST passthrough for Immich thumbnail bytes, the same shape as
 * `person-photo.controller.ts`: binary image data doesn't fit tRPC's JSON
 * contract, and — unlike `/uploads/*`, which is public static files —
 * *every* Immich read needs the API key attached server-side, so there's no
 * equivalent of that route's "just serve it statically" shortcut. Every
 * request here re-checks the session by hand for the same reason
 * `person-photo.controller.ts` does: it isn't wired through
 * `protectedProcedure`. The upload route lives here too, for the same
 * "doesn't fit tRPC's JSON contract" reason — starting a job is
 * `backup.create`-shaped (tRPC), but a multipart body never is.
 */
@Controller("immich")
export class ImmichAssetController {
  private readonly logger = new Logger(ImmichAssetController.name);

  constructor(
    private readonly immich: ImmichService,
    private readonly config: ConfigService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  @Get("people/:id/thumbnail")
  async personThumbnail(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await requireRole(this.auth, req, "member");
    const { buffer, contentType } = await this.immich.personThumbnail(id);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "private, max-age=300");
    res.send(buffer);
  }

  @Get("assets/:id/thumbnail")
  async assetThumbnail(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await requireRole(this.auth, req, "member");
    const { buffer, contentType } = await this.immich.assetThumbnail(id);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "private, max-age=300");
    res.send(buffer);
  }

  @Get("assets/:id/preview")
  async assetPreview(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await requireRole(this.auth, req, "member");
    const { buffer, contentType } = await this.immich.assetImage(id, "preview");
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "private, max-age=300");
    res.send(buffer);
  }

  @Get("assets/:id/original")
  async assetOriginal(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await requireRole(this.auth, req, "member");
    const { buffer, contentType } = await this.immich.assetOriginal(id);
    res.setHeader("content-type", contentType);
    res.setHeader("content-disposition", "attachment");
    res.send(buffer);
  }

  /**
   * A finished album/library zip, queued via `immich.enqueueAlbumZip`/
   * `enqueueAllAlbumsZip` and pointed at by an "album_zip_ready"
   * notification's `actionUrl` — byte-for-byte the same shape as
   * `BackupController.download`: `id` is validated as a bare UUID before it
   * becomes a filesystem path, and the file is deleted after one successful
   * stream (no retention policy to build; re-clicking the notification
   * after downloading 404s).
   */
  @Get("album-zips/:id")
  async downloadAlbumZip(
    @Param("id") rawId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await requireRole(this.auth, req, "member");

    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) {
      throw new BadRequestException("Invalid download id");
    }

    const dir = this.config.getOrThrow<string>("ALBUM_ZIPS_DIR");
    const path = join(dir, `${parsed.data}.zip`);
    if (!existsSync(path)) {
      throw new NotFoundException(
        "Download not found — it may already have been downloaded, or hasn't finished generating yet.",
      );
    }

    res.setHeader("content-type", "application/zip");
    res.setHeader("content-disposition", `attachment; filename="photos-${parsed.data}.zip"`);
    const stream = createReadStream(path);
    stream.pipe(res);
    stream.on("close", () => {
      rm(path, { force: true }).catch((error: unknown) => {
        this.logger.error(`Failed to remove album zip after download: ${String(error)}`);
      });
    });
  }

  /**
   * `diskStorage`, not the `FileInterceptor` default of memory storage —
   * at `IMMICH_MAX_UPLOAD_BYTES` (50MB by default, sized for large flatbed
   * scans, not phone-camera photos), several concurrent in-memory uploads
   * would be real memory pressure on this process. The temp file is
   * removed in `finally` regardless of whether forwarding to Immich
   * succeeds.
   *
   * The interceptor's own `limits.fileSize` is a fixed, generous hard
   * ceiling (not `IMMICH_MAX_UPLOAD_BYTES` itself) — Nest decorators are
   * evaluated once at class-definition time, before `ConfigService` exists,
   * so the actual configurable cap is enforced afterward in the handler
   * instead, where it can give a friendly message rather than multer's own
   * abrupt stream-truncation error.
   */
  @Post("assets")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  async uploadAsset(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("albumId") albumId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await requireRole(this.auth, req, "editor");
    } catch (error) {
      // multer has already written the upload to disk by now.
      if (file) await rm(file.path, { force: true });
      throw error;
    }
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/")) {
      await rm(file.path, { force: true });
      throw new BadRequestException("Only image or video files are accepted");
    }
    const maxBytes = this.config.getOrThrow<number>("IMMICH_MAX_UPLOAD_BYTES");
    if (file.size > maxBytes) {
      await rm(file.path, { force: true });
      throw new BadRequestException(`File exceeds the ${Math.round(maxBytes / 1_000_000)}MB limit`);
    }

    const uploaded: UploadedImmichFile = {
      path: file.path,
      mimetype: file.mimetype,
      originalname: file.originalname,
    };
    try {
      const result = await this.immich.uploadAsset(uploaded, albumId || undefined);
      res.json(result);
    } finally {
      await rm(file.path, { force: true });
    }
  }
}
