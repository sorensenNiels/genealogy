import type { CreatePerson, Parentage, PedigreeNode } from "@genealogy/core";
import {
  addParentOf,
  addSpouseOf,
  ancestorsOf,
  createDatabase,
  descendantsOf,
  inGraphTransaction,
  persons,
  upsertPersonNode,
  type Database,
  type PersonRow,
} from "@genealogy/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";

export interface ListPersonsInput {
  limit: number;
  offset: number;
  search: string | null;
}

export interface ListPersonsResult {
  items: PersonRow[];
  total: number;
}

@Injectable()
export class PersonService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async list(input: ListPersonsInput): Promise<ListPersonsResult> {
    const where = this.searchFilter(input.search);

    const items = await this.db
      .select()
      .from(persons)
      .where(where)
      .orderBy(asc(persons.surname), asc(persons.given))
      .limit(input.limit)
      .offset(input.offset);

    const [totals] = await this.db.select({ value: count() }).from(persons).where(where);

    return { items, total: totals?.value ?? 0 };
  }

  async byId(id: string): Promise<PersonRow> {
    const [row] = await this.db.select().from(persons).where(eq(persons.id, id)).limit(1);
    if (!row) {
      throw new NotFoundException(`No person with id ${id}`);
    }
    return row;
  }

  /**
   * Writes the relational row and its graph node in one transaction. If either
   * half fails the other is rolled back, which is the only thing keeping the
   * two stores from drifting apart.
   */
  async create(input: CreatePerson): Promise<PersonRow> {
    return inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      const [row] = await tx.insert(persons).values(input).returning();
      if (!row) {
        throw new Error("Insert returned no row");
      }
      await upsertPersonNode(this.pool, row.id, { client });
      return row;
    });
  }

  /** Both people must already exist; the edge is idempotent. */
  async linkParent(parentId: string, childId: string, parentage: Parentage): Promise<void> {
    if (parentId === childId) {
      throw new Error("A person cannot be their own parent");
    }
    await inGraphTransaction(this.pool, async (client) => {
      await addParentOf(this.pool, parentId, childId, parentage, { client });
    });
  }

  async linkSpouse(aId: string, bId: string): Promise<void> {
    if (aId === bId) {
      throw new Error("A person cannot be their own spouse");
    }
    await inGraphTransaction(this.pool, async (client) => {
      await addSpouseOf(this.pool, aId, bId, { client });
    });
  }

  async ancestors(id: string, generations: number): Promise<PedigreeNode[]> {
    return ancestorsOf(this.pool, id, generations);
  }

  async descendants(id: string, generations: number): Promise<PedigreeNode[]> {
    return descendantsOf(this.pool, id, generations);
  }

  private searchFilter(search: string | null): SQL | undefined {
    if (!search || search.trim() === "") return undefined;
    const pattern = `%${search.trim()}%`;
    return or(ilike(persons.surname, pattern), ilike(persons.given, pattern));
  }
}
