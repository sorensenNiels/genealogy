import { createPersonSchema, parentageSchema, personIdSchema } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { publicProcedure, router } from "../trpc/trpc.base.js";
import { PersonService } from "./person.service.js";

const listInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  search: z.string().nullable().default(null),
});

const pedigreeInput = z.object({
  id: personIdSchema,
  // Capped in the data layer too; a cyclic tree would otherwise never return.
  generations: z.number().int().min(1).max(25).default(6),
});

@Injectable()
export class PersonRouter {
  constructor(private readonly persons: PersonService) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.persons` would still be undefined.
   */
  build() {
    return router({
      list: publicProcedure.input(listInput).query(({ input }) => this.persons.list(input)),

      byId: publicProcedure
        .input(z.object({ id: personIdSchema }))
        .query(({ input }) => this.persons.byId(input.id)),

      create: publicProcedure
        .input(createPersonSchema)
        .mutation(({ input }) => this.persons.create(input)),

      linkParent: publicProcedure
        .input(
          z.object({
            parentId: personIdSchema,
            childId: personIdSchema,
            parentage: parentageSchema.default("unknown"),
          }),
        )
        .mutation(async ({ input }) => {
          await this.persons.linkParent(input.parentId, input.childId, input.parentage);
          return { ok: true } as const;
        }),

      linkSpouse: publicProcedure
        .input(z.object({ aId: personIdSchema, bId: personIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.linkSpouse(input.aId, input.bId);
          return { ok: true } as const;
        }),

      ancestors: publicProcedure
        .input(pedigreeInput)
        .query(({ input }) => this.persons.ancestors(input.id, input.generations)),

      descendants: publicProcedure
        .input(pedigreeInput)
        .query(({ input }) => this.persons.descendants(input.id, input.generations)),
    });
  }
}
