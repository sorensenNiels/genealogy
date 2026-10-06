import type { CreateAssociation, HistoricalDate } from "@genealogy/core";
import {
  associations,
  citations,
  personEvents,
  persons,
  unions,
  type AssociationRow,
  type Database,
} from "@genealogy/db";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { DRIZZLE } from "../database/database.module.js";

/** The associate, resolved for display: a person in the tree, or just the name as written. */
export interface AssociationWithAssociate extends AssociationRow {
  associateGiven: string | null;
  associateSurname: string | null;
}

/** Someone else's record this person appears in — "godparent at Karen's baptism". */
export interface AssociationAppearance extends AssociationRow {
  ownerGiven: string;
  ownerSurname: string;
  eventType: string | null;
  eventLabel: string | null;
  eventDate: HistoricalDate | null;
  /** The owner's partner in the union this role is tied to, if any. */
  unionPartnerId: string | null;
}

/**
 * Witnesses, godparents and other roles on a person's records (GEDCOM's
 * `ASSO`) — see `associationSchema` in packages/core. Relational only: no
 * graph edge, same as `unions`' evidence detail.
 */
@Injectable()
export class AssociationService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Both directions at once, since the person page shows both: the roles on
   * this person's own records (`own`), and the other people's records this
   * person appears in (`appearances`).
   */
  async list(
    personId: string,
  ): Promise<{ own: AssociationWithAssociate[]; appearances: AssociationAppearance[] }> {
    const associate = alias(persons, "associate");
    const owner = alias(persons, "owner");
    const [own, appearances] = await Promise.all([
      this.db
        .select({
          association: associations,
          associateGiven: associate.given,
          associateSurname: associate.surname,
        })
        .from(associations)
        .leftJoin(associate, eq(associations.associatePersonId, associate.id))
        .where(eq(associations.personId, personId))
        .orderBy(asc(associations.createdAt)),
      this.db
        .select({
          association: associations,
          ownerGiven: owner.given,
          ownerSurname: owner.surname,
          eventType: personEvents.eventType,
          eventLabel: personEvents.label,
          eventDate: personEvents.date,
          unionPersonAId: unions.personAId,
          unionPersonBId: unions.personBId,
        })
        .from(associations)
        .innerJoin(owner, eq(associations.personId, owner.id))
        .leftJoin(personEvents, eq(associations.eventId, personEvents.id))
        .leftJoin(unions, eq(associations.unionId, unions.id))
        .where(eq(associations.associatePersonId, personId))
        .orderBy(asc(owner.surname), asc(owner.given)),
    ]);
    return {
      own: own.map((row) =>
        Object.assign(row.association, {
          associateGiven: row.associateGiven,
          associateSurname: row.associateSurname,
        }),
      ),
      appearances: appearances.map((row) =>
        Object.assign(row.association, {
          ownerGiven: row.ownerGiven,
          ownerSurname: row.ownerSurname,
          eventType: row.eventType,
          eventLabel: row.eventLabel,
          eventDate: row.eventDate,
          unionPartnerId:
            row.unionPersonAId === row.association.personId
              ? row.unionPersonBId
              : row.unionPersonAId,
        }),
      ),
    };
  }

  /**
   * The schema can't check that `eventId`/`unionId` actually belong to this
   * person (they're plain FKs), so that's checked here — otherwise a role
   * could point at someone else's baptism.
   */
  async add(input: CreateAssociation): Promise<AssociationRow> {
    if (input.eventId) {
      const [event] = await this.db
        .select({ id: personEvents.id })
        .from(personEvents)
        .where(and(eq(personEvents.id, input.eventId), eq(personEvents.personId, input.personId)));
      if (!event) throw new BadRequestException("That event doesn't belong to this person");
    }
    if (input.unionId) {
      const [union] = await this.db
        .select({ id: unions.id })
        .from(unions)
        .where(
          and(
            eq(unions.id, input.unionId),
            or(eq(unions.personAId, input.personId), eq(unions.personBId, input.personId)),
          ),
        );
      if (!union) throw new BadRequestException("That marriage doesn't belong to this person");
    }
    const [row] = await this.db
      .insert(associations)
      .values({
        ...input,
        associateName: input.associateName?.trim() || null,
        label: input.role === "other" ? input.label : null,
      })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    return row;
  }

  /** A no-op if already removed. Clears its citations too, same as `removeUnion`. */
  async remove(id: string): Promise<void> {
    await this.db.delete(associations).where(eq(associations.id, id));
    await this.db
      .delete(citations)
      .where(and(eq(citations.factType, "association"), eq(citations.factId, id)));
  }
}
