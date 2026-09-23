import { Controller, Get, Inject, Param, Req, Res, UnauthorizedException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";

import { AUTH, type Auth } from "../auth/auth.module.js";
import { ImmichService } from "./immich.service.js";

/**
 * A REST passthrough for Immich thumbnail bytes, the same shape as
 * `person-photo.controller.ts`: binary image data doesn't fit tRPC's JSON
 * contract, and — unlike `/uploads/*`, which is public static files —
 * *every* Immich read needs the API key attached server-side, so there's no
 * equivalent of that route's "just serve it statically" shortcut. Every
 * request here re-checks the session by hand for the same reason
 * `person-photo.controller.ts` does: it isn't wired through
 * `protectedProcedure`.
 */
@Controller("immich")
export class ImmichAssetController {
  constructor(
    private readonly immich: ImmichService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  @Get("people/:id/thumbnail")
  async personThumbnail(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.requireSession(req);
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
    await this.requireSession(req);
    const { buffer, contentType } = await this.immich.assetThumbnail(id);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "private, max-age=300");
    res.send(buffer);
  }

  private async requireSession(req: Request): Promise<void> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new UnauthorizedException();
    }
  }
}
