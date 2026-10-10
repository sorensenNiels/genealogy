import { lastTreeViewSchema, type LastTreeView } from "@genealogy/core";
import {
  ancestorsByGeneration,
  persons,
  personsWithVitals,
  userProfiles,
  type Database,
  type PersonWithVitals,
} from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";

/** The generations the "your place in the tree" strip shows: parents up to 3rd great-grandparents. */
const STRIP_GENERATIONS = 5;

/** How many recently opened people a member's profile remembers. */
export const MAX_RECENT = 8;

export interface MyLine {
  person: PersonWithVitals;
  /** Known ancestors per generation, 1 (parents) to `STRIP_GENERATIONS`, of the 2^n each could have. */
  generations: { generation: number; known: number; possible: number }[];
  /** The furthest generation back anyone is known in, 0 with no parents recorded. */
  furthest: number;
  /** Every known ancestor, at any depth. */
  totalAncestors: number;
}

/**
 * The Overview's "About you" cards: where the signed-in member sits in the
 * tree, and the people they opened last. Read-only; recording a visit is
 * `ProfileService.recordPersonView`.
 */
@Injectable()
export class OverviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /** Null when the member hasn't said who they are in the tree ("This is you" on their profile). */
  async myLine(userId: string): Promise<MyLine | null> {
    const [profile] = await this.db
      .select({ personId: userProfiles.personId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    if (!profile?.personId) return null;
    const [person] = await personsWithVitals(this.db).where(eq(persons.id, profile.personId));
    if (!person) return null;

    const ancestors = await ancestorsByGeneration(this.pool, person.id);
    const generations = Array.from({ length: STRIP_GENERATIONS }, (_, index) => {
      const generation = index + 1;
      const possible = 2 ** generation;
      // Capped: pedigree collapse aside, a step or second set of parents can
      // put more people in a generation than it has places.
      const known = Math.min(
        possible,
        ancestors.filter((ancestor) => ancestor.generation === generation).length,
      );
      return { generation, known, possible };
    });
    return {
      person,
      generations,
      furthest: Math.max(0, ...ancestors.map((ancestor) => ancestor.generation)),
      totalAncestors: ancestors.length,
    };
  }

  /**
   * Where the member last had the tree — its centre person (with name and
   * dates, for the card) plus chart and direction — or null if never saved,
   * or saved on someone since deleted.
   */
  async lastTree(
    userId: string,
  ): Promise<(Omit<LastTreeView, "personId"> & { person: PersonWithVitals }) | null> {
    const [row] = await this.db
      .select({
        personId: userProfiles.lastTreePersonId,
        view: userProfiles.lastTreeView,
        orientation: userProfiles.lastTreeOrientation,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const parsed = lastTreeViewSchema.safeParse(row);
    if (!parsed.success) return null;
    const [person] = await personsWithVitals(this.db).where(eq(persons.id, parsed.data.personId));
    return person ? { view: parsed.data.view, orientation: parsed.data.orientation, person } : null;
  }

  /** The member's recently opened people, newest first; anyone deleted since is left out. */
  async recentPeople(userId: string): Promise<PersonWithVitals[]> {
    const [profile] = await this.db
      .select({ recentlyViewed: userProfiles.recentlyViewed })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const ids = (profile?.recentlyViewed ?? []).slice(0, MAX_RECENT);
    if (ids.length === 0) return [];
    const rows = await personsWithVitals(this.db).where(inArray(persons.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }
}
