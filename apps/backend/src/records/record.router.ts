import {
  personIdSchema,
  recordIdSchema,
  recordInputSchema,
  recordSearchInputSchema,
  recordTypeSchema,
} from "@genealogy/core";
import { inGraphTransaction } from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { z } from "zod";

import { PG_POOL } from "../database/database.module.js";
import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { editorProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { applyLink, RecordService } from "./record.service.js";

const relationshipCandidateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("parent"), parentId: personIdSchema, childId: personIdSchema }),
  z.object({ kind: z.literal("spouse"), aId: personIdSchema, bId: personIdSchema }),
]);

@Injectable()
export class RecordRouter {
  constructor(
    private readonly records: RecordService,
    private readonly redactor: PersonRedactor,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      /**
       * A record with its people. For a Viewer, a row linked to someone
       * living keeps only the name and role — the same "living = name only"
       * rule as everywhere else; the record's values (age, birthplace, ...)
       * would otherwise give away what the person page hides.
       */
      get: protectedProcedure
        .input(z.object({ id: recordIdSchema }))
        .query(async ({ input, ctx }) => {
          const record = await this.records.get(input.id);
          const viewer = viewerOf(ctx);
          const hidden = await this.redactor.hiddenIds(
            viewer,
            record.people.flatMap((row) => (row.personId ? [row.personId] : [])),
          );
          return {
            ...record,
            people: record.people.map((row) =>
              row.personId && hidden.has(row.personId)
                ? {
                    ...row,
                    age: "",
                    maritalStatus: "",
                    occupation: "",
                    residence: "",
                    birthplace: "",
                  }
                : row,
            ),
            // Suggestions are for editors, who can act on them.
            suggestions: hidden.size > 0 ? [] : record.suggestions,
          };
        }),

      forPerson: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input, ctx }) =>
          this.redactor.listFor(viewerOf(ctx), input.personId, () =>
            this.records.forPerson(input.personId),
          ),
        ),

      searches: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input, ctx }) =>
          this.redactor.listFor(viewerOf(ctx), input.personId, () =>
            this.records.searches(input.personId),
          ),
        ),

      save: editorProcedure
        .input(recordInputSchema)
        .mutation(({ input }) => this.records.save(input)),

      remove: editorProcedure
        .input(z.object({ id: recordIdSchema }))
        .mutation(async ({ input }) => {
          await this.records.remove(input.id);
          return { ok: true } as const;
        }),

      /** One suggested family link, made — the record page's "Link as parents?" buttons. */
      applySuggestion: editorProcedure
        .input(z.object({ recordType: recordTypeSchema, link: relationshipCandidateSchema }))
        .mutation(async ({ input }) => {
          await inGraphTransaction(this.pool, (client) =>
            applyLink(this.pool, input.link, input.recordType, client),
          );
          return { ok: true } as const;
        }),

      markNotFound: editorProcedure.input(recordSearchInputSchema).mutation(async ({ input }) => {
        await this.records.markNotFound(input);
        return { ok: true } as const;
      }),

      clearSearch: editorProcedure
        .input(z.object({ personId: personIdSchema, censusKey: z.string().min(1) }))
        .mutation(async ({ input }) => {
          await this.records.clearSearch(input.personId, input.censusKey);
          return { ok: true } as const;
        }),
    });
  }
}
