import { gedcomExportInputSchema, gedcomImportInputSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";

import { adminProcedure, router } from "../trpc/trpc.base.js";
import { GedcomImportService } from "./gedcom-import.service.js";
import { GedcomService } from "./gedcom.service.js";

@Injectable()
export class GedcomRouter {
  constructor(
    private readonly gedcom: GedcomService,
    private readonly gedcomImport: GedcomImportService,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      export: adminProcedure.input(gedcomExportInputSchema).query(async ({ ctx, input }) => ({
        gedcom: await this.gedcom.exportAll(ctx.session.user.name, input.version),
      })),
      // Both mutations, though `previewImport` writes nothing: the file text
      // travels in the request body, which a GET's query string can't carry.
      previewImport: adminProcedure
        .input(gedcomImportInputSchema)
        .mutation(({ input }) => this.gedcomImport.preview(input)),
      import: adminProcedure
        .input(gedcomImportInputSchema)
        .mutation(({ input }) => this.gedcomImport.import(input)),
    });
  }
}
