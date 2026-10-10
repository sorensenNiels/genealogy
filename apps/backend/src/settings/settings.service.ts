import type {
  AddConfigurableOption,
  PeopleListSettings,
  PersonSettings,
  RecordSettings,
  TreeSettings,
  UpdateConfigurableOption,
} from "@genealogy/core";
import {
  appSettingsKeys,
  themeSettingsSchema,
  type ThemeSettings,
  parsePeopleListSettings,
  parsePersonSettings,
  parseRecordSettings,
  parseTreeSettings,
} from "@genealogy/core";
import {
  appSettings,
  citations,
  configurableOptions,
  parentageInUse,
  personEvents,
  personNames,
  unions,
  type ConfigurableOptionRow,
  type Database,
} from "@genealogy/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, count, eq, max } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";

/** Postgres SQLSTATE 23505 — a `UNIQUE`/primary-key constraint was violated. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * The tree's display settings. A missing row (never saved), a field added
   * since the last save, or a stored value that's no longer valid comes
   * back as that field's default — see `parseTreeSettings` — rather than
   * breaking the tree page.
   */
  async getTreeSettings(): Promise<TreeSettings> {
    return parseTreeSettings(await this.readSection(appSettingsKeys.tree));
  }

  async updateTreeSettings(settings: TreeSettings): Promise<TreeSettings> {
    await this.writeSection(appSettingsKeys.tree, settings);
    return settings;
  }

  /** The person page's settings — same reading rules as `getTreeSettings`. */
  async getPersonSettings(): Promise<PersonSettings> {
    return parsePersonSettings(await this.readSection(appSettingsKeys.person));
  }

  async updatePersonSettings(settings: PersonSettings): Promise<PersonSettings> {
    await this.writeSection(appSettingsKeys.person, settings);
    return settings;
  }

  /** The Records section — record types, census countries, custom censuses, link behaviour. */
  async getRecordSettings(): Promise<RecordSettings> {
    return parseRecordSettings(await this.readSection(appSettingsKeys.records));
  }

  async updateRecordSettings(settings: RecordSettings): Promise<RecordSettings> {
    await this.writeSection(appSettingsKeys.records, settings);
    return settings;
  }

  /** The family site's theme. A saved value that no longer parses falls back to Nova. */
  async getPeopleListSettings(): Promise<PeopleListSettings> {
    return parsePeopleListSettings(await this.readSection(appSettingsKeys.peopleList));
  }

  async updatePeopleListSettings(settings: PeopleListSettings): Promise<PeopleListSettings> {
    await this.writeSection(appSettingsKeys.peopleList, settings);
    return this.getPeopleListSettings();
  }

  async getThemeSettings(): Promise<ThemeSettings> {
    const parsed = themeSettingsSchema.safeParse(
      (await this.readSection(appSettingsKeys.theme)) ?? {},
    );
    return parsed.success ? parsed.data : themeSettingsSchema.parse({});
  }

  async updateThemeSettings(settings: ThemeSettings): Promise<ThemeSettings> {
    await this.writeSection(appSettingsKeys.theme, settings);
    return settings;
  }

  /** One `app_settings` row's raw value, or undefined if never saved. */
  private async readSection(key: string): Promise<unknown> {
    const [row] = await this.db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key));
    return row?.value;
  }

  private async writeSection(key: string, value: object): Promise<void> {
    await this.db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }

  /** Every configurable option, across every topic — the table is small enough that one query beats one per topic. */
  async listOptions(): Promise<ConfigurableOptionRow[]> {
    return this.db
      .select()
      .from(configurableOptions)
      .orderBy(asc(configurableOptions.topic), asc(configurableOptions.sortOrder));
  }

  async addOption(input: AddConfigurableOption): Promise<ConfigurableOptionRow> {
    const [maxRow] = await this.db
      .select({ value: max(configurableOptions.sortOrder) })
      .from(configurableOptions)
      .where(eq(configurableOptions.topic, input.topic));
    const maxOrder = maxRow?.value ?? null;

    try {
      const [row] = await this.db
        .insert(configurableOptions)
        .values({
          topic: input.topic,
          key: input.key,
          label: input.label,
          sortOrder: (maxOrder ?? -1) + 1,
        })
        .returning();
      if (!row) {
        throw new Error("Insert returned no row");
      }
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException(
          `"${input.key}" already exists under this topic — pick a different key.`,
        );
      }
      throw error;
    }
  }

  /** `key` is immutable once created — only `label`/`sortOrder` are patchable here. */
  async updateOption(input: UpdateConfigurableOption): Promise<ConfigurableOptionRow> {
    const { id, ...patch } = input;
    const [row] = await this.db
      .update(configurableOptions)
      .set(patch)
      .where(eq(configurableOptions.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No configurable option with id ${id}`);
    }
    return row;
  }

  /**
   * Swaps this option's `sortOrder` with its neighbour in the same topic —
   * a no-op at either end of the list. Simpler and race-free compared to a
   * drag-and-drop reorder that sends the whole ordering back.
   */
  async moveOption(id: string, direction: "up" | "down"): Promise<void> {
    const [current] = await this.db
      .select()
      .from(configurableOptions)
      .where(eq(configurableOptions.id, id));
    if (!current) {
      throw new NotFoundException(`No configurable option with id ${id}`);
    }

    const siblings = await this.db
      .select()
      .from(configurableOptions)
      .where(eq(configurableOptions.topic, current.topic))
      .orderBy(asc(configurableOptions.sortOrder));
    const index = siblings.findIndex((option) => option.id === id);
    const neighbourIndex = direction === "up" ? index - 1 : index + 1;
    const neighbour = siblings[neighbourIndex];
    if (!neighbour) {
      return;
    }

    await Promise.all([
      this.db
        .update(configurableOptions)
        .set({ sortOrder: neighbour.sortOrder })
        .where(eq(configurableOptions.id, current.id)),
      this.db
        .update(configurableOptions)
        .set({ sortOrder: current.sortOrder })
        .where(eq(configurableOptions.id, neighbour.id)),
    ]);
  }

  async removeOption(id: string): Promise<void> {
    const [option] = await this.db
      .select()
      .from(configurableOptions)
      .where(eq(configurableOptions.id, id));
    if (!option) {
      return;
    }
    if (option.isProtected) {
      throw new BadRequestException(`"${option.label}" is a built-in option and can't be removed.`);
    }

    const inUse = await this.isKeyInUse(option.topic, option.key);
    if (inUse) {
      throw new BadRequestException(
        `"${option.label}" is still used by at least one record and can't be removed.`,
      );
    }

    await this.db.delete(configurableOptions).where(eq(configurableOptions.id, id));
  }

  /**
   * Whether any row still references this key — checked before deleting an
   * option, since these columns are plain `text` (see the schema.ts
   * comments on each), not real foreign keys the database could guard for
   * us. `parentage` lives on the `PARENT_OF` graph edge rather than a
   * Postgres column, so it goes through Cypher instead.
   */
  private async isKeyInUse(topic: string, key: string): Promise<boolean> {
    switch (topic) {
      case "event_type": {
        const [row] = await this.db
          .select({ value: count() })
          .from(personEvents)
          .where(eq(personEvents.eventType, key));
        return (row?.value ?? 0) > 0;
      }
      case "name_variant_type": {
        const [row] = await this.db
          .select({ value: count() })
          .from(personNames)
          .where(eq(personNames.nameType, key));
        return (row?.value ?? 0) > 0;
      }
      case "confidence": {
        const [row] = await this.db
          .select({ value: count() })
          .from(citations)
          .where(eq(citations.confidence, key));
        return (row?.value ?? 0) > 0;
      }
      case "union_status": {
        const [row] = await this.db
          .select({ value: count() })
          .from(unions)
          .where(eq(unions.status, key));
        return (row?.value ?? 0) > 0;
      }
      case "parentage":
        return parentageInUse(this.pool, key);
      default:
        return false;
    }
  }
}
