import type {
  LastTreeView,
  PeopleListPreferences,
  PeopleListPreferencesChange,
  UpdateProfile,
} from "@genealogy/core";
import {
  applyPeopleListPreferencesChange,
  lastTreeViewSchema,
  parsePeopleListPreferences,
} from "@genealogy/core";
import { userProfiles, type Database, type UserProfileRow } from "@genealogy/db";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";
import { MAX_RECENT } from "../overview/overview.service.js";

/**
 * Postgres SQLSTATE 23505 — a `UNIQUE`/primary-key constraint was violated.
 * Drizzle wraps the raw `pg` error in a `DrizzleQueryError`, which puts the
 * original error (the one that actually carries `.code`) on `.cause` rather
 * than spreading it onto itself — checking `error.code` alone here would
 * silently never match.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  return code === "23505" || cause?.code === "23505";
}

@Injectable()
export class ProfileService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Lazy — an account with no row yet (nobody has ever saved a phone number
   * or picked themselves in the tree) just reads back as "nothing set" rather
   * than needing a row created at signup for every account.
   */
  async getMyProfile(
    userId: string,
  ): Promise<Pick<UserProfileRow, "phoneNumber" | "personId" | "language">> {
    const [row] = await this.db
      .select({
        phoneNumber: userProfiles.phoneNumber,
        personId: userProfiles.personId,
        language: userProfiles.language,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return row ?? { phoneNumber: null, personId: null, language: null };
  }

  /**
   * Upserts just the fields given — `undefined` means "leave alone", mirroring
   * `PersonService.update`'s field-by-field optionality. A `personId` already
   * claimed by another account hits the partial unique index
   * (`user_profiles_person_id_idx`); that's surfaced as a clear 400 rather
   * than the raw Postgres error, since a caller can plausibly trigger this by
   * picking someone another account already identified as.
   */
  async updateProfile(
    userId: string,
    input: UpdateProfile,
  ): Promise<Pick<UserProfileRow, "phoneNumber" | "personId" | "language">> {
    try {
      const [row] = await this.db
        .insert(userProfiles)
        .values({
          userId,
          phoneNumber: input.phoneNumber ?? null,
          personId: input.personId ?? null,
          language: input.language ?? null,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
            ...(input.personId !== undefined ? { personId: input.personId } : {}),
            ...(input.language !== undefined ? { language: input.language } : {}),
            updatedAt: new Date(),
          },
        })
        .returning({
          phoneNumber: userProfiles.phoneNumber,
          personId: userProfiles.personId,
          language: userProfiles.language,
        });
      if (!row) {
        throw new Error("Upsert returned no row");
      }
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException("Someone else has already identified as this person");
      }
      throw error;
    }
  }

  /**
   * Where this member last had the tree, or null if never saved. Read
   * through `lastTreeViewSchema`, so a stored chart that no longer exists
   * (or a person since deleted, which the foreign key already nulls) reads
   * as "nothing remembered" rather than a broken link.
   */
  async getLastTreeView(userId: string): Promise<LastTreeView | null> {
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
    return parsed.success ? parsed.data : null;
  }

  async saveLastTreeView(userId: string, view: LastTreeView): Promise<void> {
    const values = {
      lastTreePersonId: view.personId,
      lastTreeView: view.view,
      lastTreeOrientation: view.orientation,
    };
    await this.db
      .insert(userProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userProfiles.userId, set: values });
  }

  /** This member's own People list choices; an empty object means "the site's defaults for everything". */
  async getPeopleListPreferences(userId: string): Promise<PeopleListPreferences> {
    const [row] = await this.db
      .select({ preferences: userProfiles.peopleListPreferences })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return parsePeopleListPreferences(row?.preferences);
  }

  /** Applies `change` to what's saved — one choice changes at a time, the rest stay; null forgets one. */
  async savePeopleListPreferences(
    userId: string,
    change: PeopleListPreferencesChange,
  ): Promise<PeopleListPreferences> {
    const preferences = applyPeopleListPreferencesChange(
      await this.getPeopleListPreferences(userId),
      change,
    );
    await this.db
      .insert(userProfiles)
      .values({ userId, peopleListPreferences: preferences })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { peopleListPreferences: preferences },
      });
    return preferences;
  }

  /**
   * Puts a person first in the member's recently opened list — once, newest
   * first, capped at `MAX_RECENT`. Called every time a person page opens, so
   * it's one small upsert.
   */
  async recordPersonView(userId: string, personId: string): Promise<void> {
    const [row] = await this.db
      .select({ recentlyViewed: userProfiles.recentlyViewed })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const recentlyViewed = [
      personId,
      ...(row?.recentlyViewed ?? []).filter((id) => id !== personId),
    ].slice(0, MAX_RECENT);
    await this.db
      .insert(userProfiles)
      .values({ userId, recentlyViewed })
      .onConflictDoUpdate({ target: userProfiles.userId, set: { recentlyViewed } });
  }
}
