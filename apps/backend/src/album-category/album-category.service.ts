import type {
  AlbumCategory,
  CreateAlbumCategoryInput,
  UpdateAlbumCategoryInput,
} from "@genealogy/core";
import { albumCategories, type Database } from "@genealogy/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

/** Same SQLSTATE 23505 check as `profile.service.ts` — see the comment there for why `.cause` is checked too. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  return code === "23505" || cause?.code === "23505";
}

const DUPLICATE_NAME = "An album category with that name already exists";

const columns = {
  id: albumCategories.id,
  name: albumCategories.name,
  color: albumCategories.color,
};

/**
 * CRUD for album categories. Which albums are *in* a category is written by
 * `ImmichService.upsertAlbumMetadata` alongside the rest of an album's local
 * metadata, and read back with it in `listAlbums` — this service only owns the
 * categories themselves. Deleting one cascades its memberships; no album is
 * touched.
 */
@Injectable()
export class AlbumCategoryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Alphabetical, case-insensitively — there's deliberately no manual order. */
  async list(): Promise<AlbumCategory[]> {
    return this.db
      .select(columns)
      .from(albumCategories)
      .orderBy(sql`lower(${albumCategories.name})`);
  }

  async create(input: CreateAlbumCategoryInput): Promise<AlbumCategory> {
    try {
      const [row] = await this.db.insert(albumCategories).values(input).returning(columns);
      if (!row) throw new Error("Insert returned no row");
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException(DUPLICATE_NAME);
      throw error;
    }
  }

  async update(input: UpdateAlbumCategoryInput): Promise<AlbumCategory> {
    const { id, ...patch } = input;
    try {
      const [row] = await this.db
        .update(albumCategories)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(albumCategories.id, id))
        .returning(columns);
      if (!row) throw new NotFoundException(`No album category with id ${id}`);
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException(DUPLICATE_NAME);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(albumCategories).where(eq(albumCategories.id, id));
  }
}
