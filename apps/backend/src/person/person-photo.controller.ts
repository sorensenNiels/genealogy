import { personIdSchema } from "@genealogy/core";
import {
  BadRequestException,
  Controller,
  Delete,
  Inject,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";

import { AUTH, type Auth } from "../auth/auth.module.js";
import { requireRole } from "../auth/require-role.js";
import { PersonService, type UploadedPhoto } from "./person.service.js";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * The one REST endpoint in an otherwise all-tRPC API: multipart file upload
 * doesn't fit tRPC's JSON-only contract, and tRPC has no first-class support
 * for it. Not wired through `protectedProcedure` for the same reason —
 * `requireSession` below re-implements that same check by hand.
 */
@Controller("people")
export class PersonPhotoController {
  constructor(
    private readonly persons: PersonService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  @Post(":id/photo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  async upload(
    @Param("id") rawId: string,
    @UploadedFile() file: UploadedPhoto | undefined,
    @Req() req: Request,
  ) {
    await requireRole(this.auth, req, "editor");
    const id = personIdSchema.parse(rawId);
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("Only image files are accepted");
    }
    return this.persons.setPhoto(id, file);
  }

  @Delete(":id/photo")
  async remove(@Param("id") rawId: string, @Req() req: Request) {
    await requireRole(this.auth, req, "editor");
    const id = personIdSchema.parse(rawId);
    return this.persons.removePhoto(id);
  }
}
