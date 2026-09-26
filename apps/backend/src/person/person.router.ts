import {
  createNameVariantSchema,
  createPersonEventSchema,
  createPersonSchema,
  createUnionSchema,
  nameVariantIdSchema,
  genderSchema,
  parentageSchema,
  personEventIdSchema,
  personIdSchema,
  unionIdSchema,
  updateNameVariantSchema,
  updatePersonEventSchema,
  updatePersonSchema,
  updateUnionSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc/trpc.base.js";
import { PersonService } from "./person.service.js";

const listInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  search: z.string().nullable().default(null),
  gender: genderSchema.nullable().default(null),
  place: z.string().nullable().default(null),
  bornAfter: z.iso.date().nullable().default(null),
  bornBefore: z.iso.date().nullable().default(null),
  hasCitation: z.boolean().default(false),
  missingBirthRecord: z.boolean().default(false),
  hasOpenResearchNote: z.boolean().default(false),
  directAncestorsOnly: z.boolean().default(false),
  sort: z.enum(["surname_asc", "given_asc", "birth_asc", "birth_desc"]).default("surname_asc"),
});

const pedigreeInput = z.object({
  id: personIdSchema,
  // Capped in the data layer too; a cyclic tree would otherwise never return.
  generations: z.number().int().min(1).max(25).default(6),
});

const treeInput = z.object({
  id: personIdSchema,
  // Smaller default than pedigreeInput's — the tree view renders every node
  // and edge at once (not just a count per generation), so it needs to stay
  // readable rather than maxing out what the graph can technically walk.
  ancestorGenerations: z.number().int().min(0).max(15).default(4),
  descendantGenerations: z.number().int().min(0).max(15).default(4),
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
      list: protectedProcedure
        .input(listInput)
        .query(({ input, ctx }) =>
          this.persons.list({ ...input, viewerUserId: ctx.session.user.id }),
        ),

      listTitlePrefixes: protectedProcedure.query(() => this.persons.listTitlePrefixes()),

      listSuffixes: protectedProcedure.query(() => this.persons.listSuffixes()),

      byId: protectedProcedure
        .input(z.object({ id: personIdSchema }))
        .query(({ input, ctx }) => this.persons.byId(input.id, ctx.session.user.id)),

      create: protectedProcedure
        .input(createPersonSchema)
        .mutation(({ input }) => this.persons.create(input)),

      update: protectedProcedure
        .input(updatePersonSchema)
        .mutation(({ input }) => this.persons.update(input)),

      remove: protectedProcedure
        .input(z.object({ id: personIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.remove(input.id);
          return { ok: true } as const;
        }),

      relatives: protectedProcedure
        .input(z.object({ id: personIdSchema }))
        .query(({ input }) => this.persons.relatives(input.id)),

      linkParent: protectedProcedure
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

      linkSpouse: protectedProcedure
        .input(z.object({ aId: personIdSchema, bId: personIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.linkSpouse(input.aId, input.bId);
          return { ok: true } as const;
        }),

      unlinkParent: protectedProcedure
        .input(z.object({ parentId: personIdSchema, childId: personIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.unlinkParent(input.parentId, input.childId);
          return { ok: true } as const;
        }),

      unlinkSpouse: protectedProcedure
        .input(z.object({ aId: personIdSchema, bId: personIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.unlinkSpouse(input.aId, input.bId);
          return { ok: true } as const;
        }),

      ancestors: protectedProcedure
        .input(pedigreeInput)
        .query(({ input }) => this.persons.ancestors(input.id, input.generations)),

      descendants: protectedProcedure
        .input(pedigreeInput)
        .query(({ input }) => this.persons.descendants(input.id, input.generations)),

      tree: protectedProcedure
        .input(treeInput)
        .query(({ input }) =>
          this.persons.tree(input.id, input.ancestorGenerations, input.descendantGenerations),
        ),

      listNames: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.persons.listNames(input.personId)),

      addName: protectedProcedure
        .input(createNameVariantSchema)
        .mutation(({ input }) => this.persons.addName(input)),

      updateName: protectedProcedure
        .input(updateNameVariantSchema)
        .mutation(({ input }) => this.persons.updateName(input)),

      removeName: protectedProcedure
        .input(z.object({ id: nameVariantIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.removeName(input.id);
          return { ok: true } as const;
        }),

      listEvents: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.persons.listEvents(input.personId)),

      addEvent: protectedProcedure
        .input(createPersonEventSchema)
        .mutation(({ input }) => this.persons.addEvent(input)),

      updateEvent: protectedProcedure
        .input(updatePersonEventSchema)
        .mutation(({ input }) => this.persons.updateEvent(input)),

      removeEvent: protectedProcedure
        .input(z.object({ id: personEventIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.removeEvent(input.id);
          return { ok: true } as const;
        }),

      listUnions: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input }) => this.persons.listUnions(input.personId)),

      addUnion: protectedProcedure
        .input(createUnionSchema)
        .mutation(({ input }) => this.persons.addUnion(input)),

      updateUnion: protectedProcedure
        .input(updateUnionSchema)
        .mutation(({ input }) => this.persons.updateUnion(input)),

      removeUnion: protectedProcedure
        .input(z.object({ id: unionIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.removeUnion(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
