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
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { z } from "zod";

import { AUTH, type Auth } from "../auth/auth.module.js";
import { requireRole } from "../auth/require-role.js";

/**
 * Downloads a finished static-site zip, pointed at by a "static_site_ready"
 * notification's `actionUrl` — byte-for-byte the shape of
 * `BackupController.download`: the id is validated as a bare UUID before it
 * becomes a filesystem path, and the file is deleted after one download.
 */
@Controller("static-sites")
export class StaticSiteController {
  private readonly logger = new Logger(StaticSiteController.name);

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly config: ConfigService,
  ) {}

  @Get(":id")
  async download(
    @Param("id") rawId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await requireRole(this.auth, req, "admin");

    const parsed = z.uuid().safeParse(rawId);
    if (!parsed.success) {
      throw new BadRequestException("Invalid download id");
    }

    const dir = this.config.getOrThrow<string>("STATIC_SITES_DIR");
    const path = join(dir, `${parsed.data}.zip`);
    if (!existsSync(path)) {
      throw new NotFoundException(
        "Website not found — it may already have been downloaded, or hasn't finished generating yet.",
      );
    }

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("content-type", "application/zip");
    res.setHeader("content-disposition", `attachment; filename="family-website-${date}.zip"`);
    const stream = createReadStream(path);
    stream.pipe(res);
    stream.on("close", () => {
      rm(path, { force: true }).catch((error: unknown) => {
        this.logger.error(`Failed to remove static site after download: ${String(error)}`);
      });
    });
  }
}
