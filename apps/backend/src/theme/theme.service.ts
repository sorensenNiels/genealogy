import {
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  findBuiltInTheme,
  themeDefinitionSchema,
  type ThemeDefinition,
  type ThemeEntry,
} from "@genealogy/core";
import { themes, userProfiles, type Database } from "@genealogy/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";
import { SettingsService } from "../settings/settings.service.js";

/** What the theme pickers need: every theme, the site's choice and the member's own. */
export interface ThemeState {
  themes: ThemeEntry[];
  siteDefaultId: string;
  /** `null` = following the site default. */
  myThemeId: string | null;
}

/**
 * Built-in themes (code, `BUILT_IN_THEMES`) and admins' custom ones (the
 * `themes` table), the site default (`app_settings` "theme") and each
 * member's own choice (`user_profiles.theme_id`). Whichever applies is
 * resolved here — member's choice, else the site's, else Nova — and an id
 * that no longer exists (a deleted custom theme) just falls through to the
 * next, so a stale reference never breaks the page.
 */
@Injectable()
export class ThemeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  /** Built-ins first, then custom themes oldest first. A stored definition that no longer validates is left out. */
  async list(): Promise<ThemeEntry[]> {
    const rows = await this.db.select().from(themes).orderBy(asc(themes.createdAt));
    const custom = rows.flatMap((row) => {
      const parsed = themeDefinitionSchema.safeParse(row.definition);
      return parsed.success ? [{ id: row.id, builtIn: false, definition: parsed.data }] : [];
    });
    return [...BUILT_IN_THEMES, ...custom];
  }

  async state(userId: string): Promise<ThemeState> {
    const [list, siteDefaultId, myThemeId] = await Promise.all([
      this.list(),
      this.settings.getThemeSettings().then((s) => s.defaultThemeId),
      this.myThemeId(userId),
    ]);
    return { themes: list, siteDefaultId, myThemeId };
  }

  /** The theme to show: the member's own, else the site's, else Nova. `userId` is null before sign-in. */
  async active(userId: string | null): Promise<ThemeEntry> {
    const candidates = [
      userId ? await this.myThemeId(userId) : null,
      (await this.settings.getThemeSettings()).defaultThemeId,
    ];
    for (const id of candidates) {
      if (!id) continue;
      const theme = await this.find(id);
      if (theme) return theme;
    }
    return DEFAULT_THEME;
  }

  async create(definition: ThemeDefinition, userId: string): Promise<ThemeEntry> {
    const [row] = await this.db
      .insert(themes)
      .values({ definition, createdBy: userId })
      .returning({ id: themes.id });
    return { id: row!.id, builtIn: false, definition };
  }

  async update(id: string, definition: ThemeDefinition): Promise<ThemeEntry> {
    const updated = await this.db
      .update(themes)
      .set({ definition, updatedAt: new Date() })
      .where(eq(themes.id, id))
      .returning({ id: themes.id });
    if (updated.length === 0) throw new NotFoundException("Theme not found");
    return { id, builtIn: false, definition };
  }

  /**
   * Deletes a custom theme. Anyone using it — the site default, or members
   * who picked it — moves back: the site to Nova, members to the site
   * default (their choice is cleared rather than left dangling).
   */
  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(userProfiles).set({ themeId: null }).where(eq(userProfiles.themeId, id));
      await tx.delete(themes).where(eq(themes.id, id));
    });
    const site = await this.settings.getThemeSettings();
    if (site.defaultThemeId === id)
      await this.settings.updateThemeSettings({ defaultThemeId: DEFAULT_THEME.id });
  }

  async setSiteDefault(id: string): Promise<void> {
    if (!(await this.find(id))) throw new BadRequestException("No such theme");
    await this.settings.updateThemeSettings({ defaultThemeId: id });
  }

  /** The member's own theme; `null` goes back to following the site default. */
  async setMine(userId: string, id: string | null): Promise<void> {
    if (id !== null && !(await this.find(id))) throw new BadRequestException("No such theme");
    await this.db
      .insert(userProfiles)
      .values({ userId, themeId: id })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { themeId: id, updatedAt: new Date() },
      });
  }

  private async myThemeId(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ themeId: userProfiles.themeId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return row?.themeId ?? null;
  }

  private async find(id: string): Promise<ThemeEntry | undefined> {
    const builtIn = findBuiltInTheme(id);
    if (builtIn) return builtIn;
    // Custom ids are uuids; anything else can't be one (and would make
    // Postgres reject the comparison rather than just find nothing).
    if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
    const [row] = await this.db.select().from(themes).where(eq(themes.id, id));
    if (!row) return undefined;
    const parsed = themeDefinitionSchema.safeParse(row.definition);
    return parsed.success ? { id: row.id, builtIn: false, definition: parsed.data } : undefined;
  }
}
