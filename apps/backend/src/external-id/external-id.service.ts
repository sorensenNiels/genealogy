import type { CreatePersonExternalId, PersonExternalId } from "@genealogy/core";
import { personExternalIds, type Database } from "@genealogy/db";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { DRIZZLE } from "../database/database.module.js";

/** Same SQLSTATE 23505 check as `profile.service.ts` — see the comment there for why `.cause` is checked too. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  return code === "23505" || cause?.code === "23505";
}

/** A person's ids in other systems — see `personExternalIds` in the schema. */
@Injectable()
export class ExternalIdService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(personId: string): Promise<PersonExternalId[]> {
    const rows = await this.db
      .select()
      .from(personExternalIds)
      .where(eq(personExternalIds.personId, personId))
      .orderBy(asc(personExternalIds.system), asc(personExternalIds.value));
    return rows.map(({ createdAt: _createdAt, ...row }) => row as PersonExternalId);
  }

  async add(input: CreatePersonExternalId): Promise<void> {
    try {
      await this.db.insert(personExternalIds).values(input);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException("This person already has that external id");
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(personExternalIds).where(eq(personExternalIds.id, id));
  }
}
