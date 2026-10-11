import {
  canEdit,
  createNameVariantSchema,
  createPersonEventSchema,
  createPersonSchema,
  createUnionSchema,
  nameVariantIdSchema,
  genderSchema,
  parentageSchema,
  personEventIdSchema,
  personIdSchema,
  peopleListGroupingSchema,
  personListSortSchema,
  researchCheckKeySchema,
  sortDirectionSchema,
  unionIdSchema,
  updateNameVariantSchema,
  updatePersonEventSchema,
  updatePersonSchema,
  updateUnionSchema,
} from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { SettingsService } from "../settings/settings.service.js";
import { adminProcedure, editorProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { PersonMergeService } from "./person-merge.service.js";
import { PersonService } from "./person.service.js";

const listInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  search: z.string().nullable().default(null),
  gender: genderSchema.nullable().default(null),
  place: z.string().nullable().default(null),
  bornAfter: z.iso.date().nullable().default(null),
  bornBefore: z.iso.date().nullable().default(null),
  missing: researchCheckKeySchema.nullable().default(null),
  hasOpenResearchNote: z.boolean().default(false),
  directAncestorsOnly: z.boolean().default(false),
  sortBy: personListSortSchema.default("surname"),
  sortDir: sortDirectionSchema.default("asc"),
  grouping: peopleListGroupingSchema.default("none"),
  similarSpellings: z.boolean().default(false),
  withFamily: z.boolean().default(false),
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
  constructor(
    private readonly persons: PersonService,
    private readonly merges: PersonMergeService,
    private readonly redactor: PersonRedactor,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Built by a method rather than a field initializer: class fields run before
   * the constructor body, so `this.persons` would still be undefined.
   */
  build() {
    const mergeInput = z.object({ keepId: personIdSchema, removeId: personIdSchema });
    return router({
      // A query, though it reads a fair bit: nothing is written until `merge`.
      mergePreview: adminProcedure
        .input(mergeInput)
        .query(({ input }) => this.merges.preview(input.keepId, input.removeId)),
      merge: adminProcedure.input(mergeInput).mutation(async ({ input }) => {
        await this.merges.merge(input.keepId, input.removeId);
        return { ok: true } as const;
      }),
      list: protectedProcedure.input(listInput).query(async ({ input, ctx }) => {
        const viewer = viewerOf(ctx);
        const livingDetail = await this.redactor.livingDetail(viewer);
        const result = await this.persons.list({
          ...input,
          // Research notes are hidden from a Viewer on living people, so a
          // filter on them would tell a Viewer what they can't see.
          hasOpenResearchNote: canEdit(ctx.role) && input.hasOpenResearchNote,
          viewerUserId: ctx.session.user.id,
          excludeLiving: livingDetail === "hidden",
        });
        const items = await this.redactor.people(viewer, result.items);
        // A marriage date is as private as a birth date: none for a couple
        // where either partner is shown to this viewer by name only. The
        // names themselves stay — a redacted person keeps their place in
        // the tree.
        const hidden = await this.redactor.hiddenIds(viewer, [
          ...items.map((item) => item.id),
          ...items.flatMap((item) => item.family?.spouses.map((spouse) => spouse.id) ?? []),
          ...items.flatMap((item) => item.family?.parents.map((parent) => parent.id) ?? []),
        ]);
        // A redacted person's citations and alternate names are hidden, so
        // their summary and the name a search found them by are too.
        // When Viewers see nothing of the living, a living parent or spouse
        // named on a row loses their name too ("Living person").
        const hideName = <T extends { id: string }>(relative: T): T =>
          livingDetail === "hidden" && hidden.has(relative.id)
            ? { ...relative, given: "", surname: "" }
            : relative;
        return {
          ...result,
          items: items.map((item) => {
            const family = item.family && {
              parents: item.family.parents.map(hideName),
              spouses: item.family.spouses.map((spouse) =>
                hideName(
                  hidden.has(item.id) || hidden.has(spouse.id)
                    ? { ...spouse, married: null }
                    : spouse,
                ),
              ),
            };
            return item.redacted
              ? { ...item, family, citationCount: 0, topConfidence: null, alsoKnownAs: null }
              : { ...item, family };
          }),
        };
      }),

      listTitlePrefixes: protectedProcedure.query(() => this.persons.listTitlePrefixes()),

      listSuffixes: protectedProcedure.query(() => this.persons.listSuffixes()),

      byId: protectedProcedure
        .input(z.object({ id: personIdSchema }))
        .query(async ({ input, ctx }) =>
          this.redactor.person(
            viewerOf(ctx),
            await this.persons.byId(input.id, ctx.session.user.id),
          ),
        ),

      create: editorProcedure
        .input(createPersonSchema)
        .mutation(({ input }) => this.persons.create(input)),

      update: editorProcedure
        .input(updatePersonSchema)
        .mutation(({ input }) => this.persons.update(input)),

      remove: adminProcedure.input(z.object({ id: personIdSchema })).mutation(async ({ input }) => {
        await this.persons.remove(input.id);
        return { ok: true } as const;
      }),

      // The Tools page's "Presumed deceased": everyone still marked living
      // who was born longer ago than the Settings page's limit. Admin, like
      // the rest of Tools — it changes many people at once.
      presumedDeceased: adminProcedure.query(async () => {
        const { presumeDeceasedAfterYears } = await this.settings.getPersonSettings();
        return {
          afterYears: presumeDeceasedAfterYears,
          people: await this.persons.presumedDeceased(presumeDeceasedAfterYears),
        };
      }),

      markPresumedDeceased: adminProcedure.mutation(async () => {
        const { presumeDeceasedAfterYears } = await this.settings.getPersonSettings();
        return { updated: await this.persons.markPresumedDeceased(presumeDeceasedAfterYears) };
      }),

      relatives: protectedProcedure
        .input(z.object({ id: personIdSchema }))
        .query(async ({ input, ctx }) => {
          // The Family card's scope (Settings → Person page): half-siblings
          // are always worked out and just filtered, the derived relations
          // only when they'll be shown.
          const settings = await this.settings.getPersonSettings();
          const relatives = await this.persons.relatives(input.id, {
            stepRelations: settings.showStepRelations,
            inLaws: settings.showInLaws,
          });
          const viewer = viewerOf(ctx);
          const redact = <T extends { id: string; isLiving: boolean; restriction: string | null }>(
            rows: T[],
          ) => this.redactor.people(viewer, rows);
          const [
            parents,
            spouses,
            children,
            siblings,
            stepParents,
            stepSiblings,
            stepChildren,
            parentsInLaw,
            siblingsInLaw,
            childrenInLaw,
          ] = await Promise.all([
            redact(relatives.parents),
            redact(relatives.spouses),
            redact(relatives.children),
            redact(
              settings.showHalfSiblings
                ? relatives.siblings
                : relatives.siblings.filter((sibling) => !sibling.half),
            ),
            redact(relatives.stepParents),
            redact(relatives.stepSiblings),
            redact(relatives.stepChildren),
            redact(relatives.parentsInLaw),
            redact(relatives.siblingsInLaw),
            redact(relatives.childrenInLaw),
          ]);
          return {
            parents,
            spouses,
            children,
            siblings,
            stepParents,
            stepSiblings,
            stepChildren,
            parentsInLaw,
            siblingsInLaw,
            childrenInLaw,
          };
        }),

      linkParent: editorProcedure
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

      linkSpouse: editorProcedure
        .input(z.object({ aId: personIdSchema, bId: personIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.linkSpouse(input.aId, input.bId);
          return { ok: true } as const;
        }),

      unlinkParent: editorProcedure
        .input(z.object({ parentId: personIdSchema, childId: personIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.unlinkParent(input.parentId, input.childId);
          return { ok: true } as const;
        }),

      unlinkSpouse: editorProcedure
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

      tree: protectedProcedure.input(treeInput).query(async ({ input, ctx }) => {
        const tree = await this.persons.tree(
          input.id,
          input.ancestorGenerations,
          input.descendantGenerations,
        );
        const people = await this.redactor.people(viewerOf(ctx), tree.people);
        // A marriage date is as private as a birth date: none for a couple
        // where either partner is shown to this viewer by name only.
        const hidden = new Set(
          people.filter((person) => person.redacted).map((person) => person.id),
        );
        const marriages = tree.marriages.filter(
          (marriage) => !hidden.has(marriage.personAId) && !hidden.has(marriage.personBId),
        );
        return { ...tree, people, marriages };
      }),

      listNames: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input, ctx }) =>
          this.redactor.listFor(viewerOf(ctx), input.personId, () =>
            this.persons.listNames(input.personId),
          ),
        ),

      addName: editorProcedure
        .input(createNameVariantSchema)
        .mutation(({ input }) => this.persons.addName(input)),

      updateName: editorProcedure
        .input(updateNameVariantSchema)
        .mutation(({ input }) => this.persons.updateName(input)),

      removeName: editorProcedure
        .input(z.object({ id: nameVariantIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.removeName(input.id);
          return { ok: true } as const;
        }),

      listEvents: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(({ input, ctx }) =>
          this.redactor.listFor(viewerOf(ctx), input.personId, () =>
            this.persons.listEvents(input.personId),
          ),
        ),

      addEvent: editorProcedure
        .input(createPersonEventSchema)
        .mutation(({ input }) => this.persons.addEvent(input)),

      updateEvent: editorProcedure
        .input(updatePersonEventSchema)
        .mutation(({ input }) => this.persons.updateEvent(input)),

      removeEvent: editorProcedure
        .input(z.object({ id: personEventIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.removeEvent(input.id);
          return { ok: true } as const;
        }),

      listUnions: protectedProcedure
        .input(z.object({ personId: personIdSchema }))
        .query(async ({ input, ctx }) => {
          // A marriage is about both partners: if either may only be seen by
          // name, its dates, places and notes are hidden — the fact of it
          // (and its status) stays, as the Family card shows the spouse anyway.
          const rows = await this.persons.listUnions(input.personId);
          const hidden = await this.redactor.hiddenIds(
            viewerOf(ctx),
            rows.flatMap((row) => [row.personAId, row.personBId]),
          );
          return rows.map((row) =>
            hidden.has(row.personAId) || hidden.has(row.personBId)
              ? {
                  ...row,
                  startDate: null,
                  startPlace: null,
                  endDate: null,
                  endPlace: null,
                  notes: null,
                }
              : row,
          );
        }),

      addUnion: editorProcedure
        .input(createUnionSchema)
        .mutation(({ input }) => this.persons.addUnion(input)),

      updateUnion: editorProcedure
        .input(updateUnionSchema)
        .mutation(({ input }) => this.persons.updateUnion(input)),

      removeUnion: editorProcedure
        .input(z.object({ id: unionIdSchema }))
        .mutation(async ({ input }) => {
          await this.persons.removeUnion(input.id);
          return { ok: true } as const;
        }),
    });
  }
}
