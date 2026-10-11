import { canEdit } from "@genealogy/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { PersonRedactor, viewerOf } from "../privacy/person-redactor.js";
import { SettingsService } from "../settings/settings.service.js";
import { adminProcedure, editorProcedure, protectedProcedure, router } from "../trpc/trpc.base.js";
import { OverviewFamilyService } from "./overview-family.service.js";
import { OverviewResearchService } from "./overview-research.service.js";
import { OverviewService } from "./overview.service.js";

/** The member's own today — "On this day" and the featured ancestor follow their calendar, not the server's. */
const todayInput = z.object({ today: z.iso.date() });

@Injectable()
export class OverviewRouter {
  constructor(
    private readonly overview: OverviewService,
    private readonly family: OverviewFamilyService,
    private readonly research: OverviewResearchService,
    private readonly settings: SettingsService,
    private readonly redactor: PersonRedactor,
  ) {}

  /** Built by a method rather than a field initializer — same reason as every other router in this app. */
  build() {
    return router({
      // Each member's own; their own person is never redacted for them
      // (`PersonRedactor`), and ancestor counts say nothing about anyone.
      myLine: protectedProcedure.query(async ({ ctx }) => {
        const line = await this.overview.myLine(ctx.session.user.id);
        if (!line) return null;
        return { ...line, person: await this.redactor.person(viewerOf(ctx), line.person) };
      }),

      lastTree: protectedProcedure.query(async ({ ctx }) => {
        const last = await this.overview.lastTree(ctx.session.user.id);
        if (!last) return null;
        return { ...last, person: await this.redactor.person(viewerOf(ctx), last.person) };
      }),

      // A Viewer may have opened a living relative's page (they see it by
      // name only) — the list shows them the same way.
      recentPeople: protectedProcedure.query(async ({ ctx }) =>
        this.redactor.people(viewerOf(ctx), await this.overview.recentPeople(ctx.session.user.id)),
      ),

      // Settings → Overview picks the events. Living people only for an
      // editor with "living birthdays" on — a Viewer never gets an entry
      // naming someone living, so there's nothing in it to redact.
      onThisDay: protectedProcedure.input(todayInput).query(async ({ input, ctx }) => {
        const settings = await this.settings.getOverviewSettings();
        const [, month, day] = input.today.split("-").map(Number);
        return this.family.onThisDay({
          month: month!,
          day: day!,
          todayIso: input.today,
          events: settings.onThisDayEvents,
          includeLiving: canEdit(ctx.role) && settings.onThisDayLivingBirthdays,
        });
      }),

      // Always someone deceased, so the same for every role.
      featuredAncestor: protectedProcedure
        .input(todayInput)
        .query(({ input, ctx }) => this.family.featuredAncestor(ctx.session.user.id, input.today)),

      // Counts only, and the earliest-born person, who is long dead — but
      // through the redactor anyway, should a tree start with someone living.
      familyAtAGlance: protectedProcedure.query(async ({ ctx }) => {
        const glance = await this.family.familyAtAGlance();
        return {
          ...glance,
          earliest: glance.earliest && (await this.redactor.person(viewerOf(ctx), glance.earliest)),
        };
      }),

      // A Viewer doesn't see living people's birthplaces, so they aren't counted for one.
      topPlaces: protectedProcedure.query(({ ctx }) => this.family.topPlaces(!canEdit(ctx.role))),

      researchTodo: editorProcedure.query(({ ctx }) =>
        this.research.researchTodo(ctx.session.user.id),
      ),

      censusGaps: editorProcedure.query(() => this.research.censusGaps()),

      recentChanges: editorProcedure.query(() => this.research.recentChanges()),

      upkeep: adminProcedure
        .input(z.object({ refresh: z.boolean().default(false) }))
        .query(({ input }) => this.research.upkeep(input.refresh)),
    });
  }
}
