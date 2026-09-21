import type { CreateCitation, CreateSource } from "@genealogy/core";
import { citations, sources, type CitationRow, type Database, type SourceRow } from "@genealogy/db";
import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

@Injectable()
export class SourceService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Every source, for picking an existing one to add another citation against. */
  async listSources(): Promise<SourceRow[]> {
    return this.db.select().from(sources).orderBy(asc(sources.title));
  }

  async createSource(input: CreateSource): Promise<SourceRow> {
    const [row] = await this.db.insert(sources).values(input).returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  /** Every citation for this person, across every fact (person-level, birth, an event, ...). */
  async listCitations(personId: string): Promise<CitationRow[]> {
    return this.db.select().from(citations).where(eq(citations.personId, personId));
  }

  async addCitation(input: CreateCitation): Promise<CitationRow> {
    const [row] = await this.db.insert(citations).values(input).returning();
    if (!row) {
      throw new Error("Insert returned no row");
    }
    return row;
  }

  /** A no-op if the citation was already removed. */
  async removeCitation(id: string): Promise<void> {
    await this.db.delete(citations).where(eq(citations.id, id));
  }
}
