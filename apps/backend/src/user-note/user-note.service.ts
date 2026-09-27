import type { CreateUserNote, UpdateUserNote } from "@genealogy/core";
import { userNotes, type Database, type UserNoteRow } from "@genealogy/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

@Injectable()
export class UserNoteService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Every note for this account, most recently updated first. */
  async listNotes(userId: string): Promise<UserNoteRow[]> {
    return this.db
      .select()
      .from(userNotes)
      .where(eq(userNotes.userId, userId))
      .orderBy(desc(userNotes.updatedAt));
  }

  async addNote(userId: string, input: CreateUserNote): Promise<UserNoteRow> {
    const [row] = await this.db
      .insert(userNotes)
      .values({ ...input, userId })
      .returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  /**
   * Scoped by `userId` in the `where` clause itself, not checked afterwards —
   * a note belonging to someone else just reads back as "not found" rather
   * than leaking whether the id exists at all.
   */
  async updateNote(userId: string, input: UpdateUserNote): Promise<UserNoteRow> {
    const { id, ...patch } = input;
    const [row] = await this.db
      .update(userNotes)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(userNotes.id, id), eq(userNotes.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException(`No note with id ${id}`);
    }
    return row;
  }

  /** A no-op if the note was already removed, or belongs to someone else. */
  async removeNote(userId: string, id: string): Promise<void> {
    await this.db.delete(userNotes).where(and(eq(userNotes.id, id), eq(userNotes.userId, userId)));
  }
}
