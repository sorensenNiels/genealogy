import { canEdit, isRedactedFor, type MemberRole } from "@genealogy/core";
import { persons, userProfiles, type Database } from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

/** Who is reading — a router builds this from its tRPC context with `viewerOf`. */
export interface Viewer {
  role: MemberRole;
  userId: string;
}

export function viewerOf(ctx: { role: MemberRole; session: { user: { id: string } } }): Viewer {
  return { role: ctx.role, userId: ctx.session.user.id };
}

/**
 * What a redacted person keeps is everything *not* listed here: name, gender,
 * title/suffix, public id, living status, and their place in the tree.
 */
const REDACTED_FIELDS = {
  birth: null,
  birthPlace: null,
  death: null,
  deathPlace: null,
  notes: null,
  photoPath: null,
  redacted: true,
} as const;

/**
 * "Name only" for a Viewer looking at someone living (or private/
 * confidential) — see `isRedactedFor` in `@genealogy/core` for the rule.
 * Enforced here, server-side, on what each read returns; the frontend only
 * decides how a redacted person *looks*. Applied in the routers rather than
 * inside each service, so the services stay role-agnostic and every
 * redaction is visible at the procedure that returns the data.
 *
 * A Viewer's own linked person ("this is me") is never redacted for them.
 */
@Injectable()
export class PersonRedactor {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** The ones among `personIds` this viewer may only see by name. */
  async hiddenIds(viewer: Viewer, personIds: readonly string[]): Promise<Set<string>> {
    if (canEdit(viewer.role) || personIds.length === 0) return new Set();
    const [rows, ownId] = await Promise.all([
      this.db
        .select({ id: persons.id, isLiving: persons.isLiving, restriction: persons.restriction })
        .from(persons)
        .where(inArray(persons.id, [...new Set(personIds)])),
      this.ownPersonId(viewer),
    ]);
    return new Set(
      rows
        .filter((row) => row.id !== ownId && isRedactedFor(viewer.role, row))
        .map((row) => row.id),
    );
  }

  async isHidden(viewer: Viewer, personId: string): Promise<boolean> {
    return (await this.hiddenIds(viewer, [personId])).has(personId);
  }

  /** Every row marked `redacted`, the hidden ones also stripped to name only. */
  async people<T extends { id: string; isLiving: boolean; restriction: string | null }>(
    viewer: Viewer,
    rows: T[],
  ): Promise<(T & { redacted: boolean })[]> {
    const hidden = await this.hiddenIds(
      viewer,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      hidden.has(row.id)
        ? Object.assign({}, row, REDACTED_FIELDS)
        : Object.assign({}, row, { redacted: false }),
    );
  }

  async person<T extends { id: string; isLiving: boolean; restriction: string | null }>(
    viewer: Viewer,
    row: T,
  ): Promise<T & { redacted: boolean }> {
    const [result] = await this.people(viewer, [row]);
    return result!;
  }

  /** A per-person list (names, events, citations, ...) — empty for someone this viewer may only see by name. */
  async listFor<T>(viewer: Viewer, personId: string, load: () => Promise<T[]>): Promise<T[]> {
    return (await this.isHidden(viewer, personId)) ? [] : load();
  }

  private async ownPersonId(viewer: Viewer): Promise<string | null> {
    const [row] = await this.db
      .select({ personId: userProfiles.personId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, viewer.userId))
      .limit(1);
    return row?.personId ?? null;
  }
}
