import type { CreateResearchNote, UpdateResearchNote } from "@genealogy/core";
import { researchNotes, type Database, type ResearchNoteRow } from "@genealogy/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

@Injectable()
export class ResearchNoteService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Every research note for this person, newest first. */
  async listNotes(personId: string): Promise<ResearchNoteRow[]> {
    return this.db
      .select()
      .from(researchNotes)
      .where(eq(researchNotes.personId, personId))
      .orderBy(researchNotes.createdAt);
  }

  async addNote(input: CreateResearchNote): Promise<ResearchNoteRow> {
    const [row] = await this.db.insert(researchNotes).values(input).returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  async updateNote(input: UpdateResearchNote): Promise<ResearchNoteRow> {
    const { id, ...patch } = input;
    const [row] = await this.db
      .update(researchNotes)
      .set(patch)
      .where(eq(researchNotes.id, id))
      .returning();
    if (!row) {
      throw new NotFoundException(`No research note with id ${id}`);
    }
    return row;
  }

  /** A no-op if the note was already removed. */
  async removeNote(id: string): Promise<void> {
    await this.db.delete(researchNotes).where(eq(researchNotes.id, id));
  }
}
