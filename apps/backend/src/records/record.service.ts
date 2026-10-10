import {
  ageMismatch,
  findCensus,
  isPrincipal,
  RECORD_TEMPLATES,
  recordTypeSchema,
  relationshipCandidates,
  type HistoricalDate,
  type RecordInput,
  type RecordSearchInput,
  type RecordType,
  type RelationshipCandidate,
} from "@genealogy/core";
import {
  addParentOf,
  addSpouseOf,
  associations,
  birthEvents,
  citations,
  configurableOptions,
  createDatabase,
  inGraphTransaction,
  parentsOf,
  personEvents,
  persons,
  recordPeople,
  records,
  recordSearches,
  spousesOf,
  unions,
  type Database,
  type RecordPersonRow,
  type RecordRow,
} from "@genealogy/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Pool, PoolClient } from "pg";

import { DRIZZLE, PG_POOL } from "../database/database.module.js";
import { SettingsService } from "../settings/settings.service.js";

/** A record row with the person it's linked to (if any), for the editor. */
export interface RecordPersonWithPerson extends RecordPersonRow {
  person: { id: string; given: string; surname: string; isLiving: boolean } | null;
}

export interface RecordWithPeople extends RecordRow {
  people: RecordPersonWithPerson[];
  /** Family links the record implies that the tree doesn't have yet — see `relationshipCandidates`. */
  suggestions: RelationshipCandidate[];
}

/** One record a person is named in, for their page: the record, their own row, and who else. */
export interface PersonRecordEntry {
  record: RecordRow;
  row: RecordPersonRow;
  /** The principal's name as written — the census head, the baptised child, the couple, the deceased. */
  principalNames: string[];
  memberCount: number;
}

export interface RecordAgeMismatch {
  personId: string;
  personName: { given: string; surname: string };
  birth: HistoricalDate | null;
  recordId: string;
  recordType: RecordType;
  censusKey: string | null;
  year: number | null;
  age: string;
  /** Years the record's age is off from the recorded birth (positive: older in the record). */
  yearsOff: number;
}

type Tx = ReturnType<typeof createDatabase>;

/**
 * Records entered as written — census households, baptisms, marriages,
 * burials — and what they mean in the tree (see "Records" in
 * TECH_STACK.md). The record and its rows are the transcription; for each
 * row linked to a person, this service keeps the matching tree data in step
 * on every save, in one graph transaction:
 *
 * - a principal (every census row; a baptism's child; a burial's deceased)
 *   gets the template's event, citing the record's source;
 * - a marriage's groom and bride get a union (an open one between them is
 *   reused), citing the source;
 * - a godparent, witness, officiant or informant becomes an association on
 *   the principal's event or the union — by person if linked, by name if not.
 *
 * Unlinking a row or removing it undoes what it created; deleting a record
 * undoes everything (a reused union is left alone). Implied family links
 * (parents at a baptism, a census head's children) are suggestions, or made
 * on save when Settings says "automatic".
 */
@Injectable()
export class RecordService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly settings: SettingsService,
  ) {}

  async get(id: string): Promise<RecordWithPeople> {
    const [record] = await this.db.select().from(records).where(eq(records.id, id));
    if (!record) throw new NotFoundException("No such record");
    const rows = await this.db
      .select({
        row: recordPeople,
        person: {
          id: persons.id,
          given: persons.given,
          surname: persons.surname,
          isLiving: persons.isLiving,
        },
      })
      .from(recordPeople)
      .leftJoin(persons, eq(persons.id, recordPeople.personId))
      .where(eq(recordPeople.recordId, id))
      .orderBy(asc(recordPeople.sortOrder));
    const people = rows.map((item) => ({
      ...item.row,
      person: item.person?.id ? item.person : null,
    }));
    const type = recordTypeSchema.parse(record.recordType);
    return { ...record, people, suggestions: await this.missingLinks(type, people) };
  }

  /** Every record this person is named in, oldest first. */
  async forPerson(personId: string): Promise<PersonRecordEntry[]> {
    const own = await this.db
      .select({ row: recordPeople, record: records })
      .from(recordPeople)
      .innerJoin(records, eq(records.id, recordPeople.recordId))
      .where(eq(recordPeople.personId, personId))
      .orderBy(
        sql`coalesce(${records.date}->>'earliest', ${records.date}->>'latest') asc nulls last`,
      );
    if (own.length === 0) return [];
    const everyone = await this.db
      .select({ recordId: recordPeople.recordId, name: recordPeople.name, role: recordPeople.role })
      .from(recordPeople)
      .where(
        inArray(
          recordPeople.recordId,
          own.map((item) => item.record.id),
        ),
      )
      .orderBy(asc(recordPeople.sortOrder));
    return own.map(({ row, record }) => {
      const type = recordTypeSchema.parse(record.recordType);
      const listed = everyone.filter((person) => person.recordId === record.id);
      const principals =
        type === "census"
          ? listed.filter((person) => person.role === "head").slice(0, 1)
          : listed.filter((person) => isPrincipal(type, person.role));
      return {
        record,
        row,
        principalNames: (principals.length > 0 ? principals : listed.slice(0, 1)).map(
          (person) => person.name,
        ),
        memberCount: listed.length,
      };
    });
  }

  async searches(personId: string) {
    return this.db
      .select()
      .from(recordSearches)
      .where(eq(recordSearches.personId, personId))
      .orderBy(asc(recordSearches.censusKey));
  }

  async markNotFound(input: RecordSearchInput): Promise<void> {
    await this.db
      .insert(recordSearches)
      .values(input)
      .onConflictDoUpdate({
        target: [recordSearches.personId, recordSearches.censusKey],
        set: { note: input.note },
      });
  }

  async clearSearch(personId: string, censusKey: string): Promise<void> {
    await this.db
      .delete(recordSearches)
      .where(and(eq(recordSearches.personId, personId), eq(recordSearches.censusKey, censusKey)));
  }

  /** Saves a whole record from the editor and brings the tree in line with it — see the class comment. */
  async save(input: RecordInput): Promise<{ id: string }> {
    const [settings, positionLabels] = await Promise.all([
      this.settings.getRecordSettings(),
      this.positionLabels(),
    ]);
    const template = RECORD_TEMPLATES[input.recordType];
    const census =
      input.recordType === "census" ? findCensus(input.censusKey, settings.customCensuses) : null;

    const id = await inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      const values = {
        recordType: input.recordType,
        censusKey: input.recordType === "census" ? input.censusKey : null,
        date: input.date,
        place: input.place,
        address: input.address,
        reference: input.reference,
        sourceId: input.sourceId,
        page: input.page,
        url: input.url,
        notes: input.notes,
      };

      let previous: RecordRow | undefined;
      let recordId: string;
      if (input.id) {
        [previous] = await tx.select().from(records).where(eq(records.id, input.id));
        if (!previous) throw new NotFoundException("No such record");
        await tx
          .update(records)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(records.id, input.id));
        recordId = input.id;
      } else {
        const [created] = await tx.insert(records).values(values).returning({ id: records.id });
        recordId = created!.id;
      }
      const previousSourceId = previous?.sourceId ?? null;
      const cite = (fact: { factType: "event" | "union"; factId: string; personId: string }) =>
        this.syncCitation(tx, {
          ...fact,
          previousSourceId,
          input,
          confidence: settings.citationConfidence,
        });

      const existingRows = await tx
        .select()
        .from(recordPeople)
        .where(eq(recordPeople.recordId, recordId));
      const existingById = new Map(existingRows.map((row) => [row.id, row]));
      const keptIds = new Set<string>();

      // Pass 1: the rows themselves, and each principal's event.
      const saved: Array<{ row: RecordPersonRow; input: RecordInput["people"][number] }> = [];
      for (const [index, person] of input.people.entries()) {
        const before = person.id ? existingById.get(person.id) : undefined;
        if (before) keptIds.add(before.id);
        const birthplace = census && !census.hasBirthplace ? "" : person.birthplace;
        const principal = isPrincipal(input.recordType, person.role);

        let eventId = before?.eventId ?? null;
        const keepEvent =
          eventId !== null &&
          principal &&
          before?.personId === person.personId &&
          template.eventType;
        if (eventId && !keepEvent) {
          // eslint-disable-next-line no-await-in-loop
          await this.removeEvent(tx, eventId);
          eventId = null;
        }
        if (principal && person.personId && template.eventType) {
          const event = {
            personId: person.personId,
            eventType: template.eventType,
            date: input.date,
            place: input.place.trim() === "" ? null : input.place,
            details: compact(
              eventDetails(input, person, {
                position: positionLabels.get(person.role) ?? person.role,
                birthplace,
                officiant: input.people.find((other) => other.role === "officiant")?.name ?? "",
              }),
            ),
          };
          if (eventId) {
            // eslint-disable-next-line no-await-in-loop
            await tx
              .update(personEvents)
              .set({ ...event, updatedAt: new Date() })
              .where(eq(personEvents.id, eventId));
          } else {
            // eslint-disable-next-line no-await-in-loop
            const [created] = await tx
              .insert(personEvents)
              .values(event)
              .returning({ id: personEvents.id });
            eventId = created!.id;
          }
          // eslint-disable-next-line no-await-in-loop
          await cite({ factType: "event", factId: eventId, personId: person.personId });
          if (input.recordType === "census" && input.censusKey) {
            // Found in this census: no longer "searched, not found".
            // eslint-disable-next-line no-await-in-loop
            await tx
              .delete(recordSearches)
              .where(
                and(
                  eq(recordSearches.personId, person.personId),
                  eq(recordSearches.censusKey, input.censusKey),
                ),
              );
          }
        }

        const rowValues = {
          recordId,
          sortOrder: index,
          role: person.role,
          name: person.name,
          sex: person.sex,
          age: person.age,
          maritalStatus: person.maritalStatus,
          occupation: person.occupation,
          residence: person.residence,
          birthplace,
          personId: person.personId,
          eventId,
        };
        let row: RecordPersonRow;
        if (before) {
          // eslint-disable-next-line no-await-in-loop
          [row] = (await tx
            .update(recordPeople)
            .set({ ...rowValues, updatedAt: new Date() })
            .where(eq(recordPeople.id, before.id))
            .returning()) as [RecordPersonRow];
        } else {
          // eslint-disable-next-line no-await-in-loop
          [row] = (await tx.insert(recordPeople).values(rowValues).returning()) as [
            RecordPersonRow,
          ];
        }
        saved.push({ row, input: person });
      }

      // Rows taken out of the record take what they created with them.
      for (const row of existingRows) {
        if (keptIds.has(row.id)) continue;
        // eslint-disable-next-line no-await-in-loop
        if (row.eventId) await this.removeEvent(tx, row.eventId);
        // eslint-disable-next-line no-await-in-loop
        if (row.associationId) await this.removeAssociation(tx, row.associationId);
        // eslint-disable-next-line no-await-in-loop
        await tx.delete(recordPeople).where(eq(recordPeople.id, row.id));
      }

      // A marriage: the union between groom and bride.
      let union: { id: string; personId: string } | null = null;
      if (input.recordType === "marriage") {
        union = await this.syncUnion(tx, client, recordId, previous, saved, input);
        if (union) await cite({ factType: "union", factId: union.id, personId: union.personId });
      }

      // Pass 2: godparents, witnesses and the like, on the principal's
      // event (or the union) — they need it to exist first.
      const principalEvent = saved.find(
        (item) => item.row.eventId && isPrincipal(input.recordType, item.row.role),
      );
      for (const { row, input: person } of saved) {
        const role = template.associationRoles[person.role];
        const anchor =
          input.recordType === "marriage"
            ? union && { personId: union.personId, eventId: null, unionId: union.id }
            : principalEvent && {
                personId: principalEvent.row.personId!,
                eventId: principalEvent.row.eventId!,
                unionId: null,
              };
        const associate =
          person.personId !== null
            ? { associatePersonId: person.personId, associateName: null }
            : person.name.trim() !== ""
              ? { associatePersonId: null, associateName: person.name }
              : null;
        let associationId = row.associationId;
        const wanted = role && anchor && associate && anchor.personId !== person.personId;
        if (!wanted) {
          // eslint-disable-next-line no-await-in-loop
          if (associationId) await this.removeAssociation(tx, associationId);
          associationId = null;
        } else {
          const association = { ...anchor, ...associate, role, label: null };
          if (associationId) {
            // eslint-disable-next-line no-await-in-loop
            const [updated] = await tx
              .update(associations)
              .set(association)
              .where(eq(associations.id, associationId))
              .returning({ id: associations.id });
            associationId = updated?.id ?? null;
          }
          if (!associationId) {
            // eslint-disable-next-line no-await-in-loop
            const [created] = await tx
              .insert(associations)
              .values(association)
              .returning({ id: associations.id });
            associationId = created!.id;
          }
        }
        if (associationId !== row.associationId) {
          // eslint-disable-next-line no-await-in-loop
          await tx.update(recordPeople).set({ associationId }).where(eq(recordPeople.id, row.id));
        }
      }

      // "Automatic" family links: made now, never replacing what's there.
      if (settings.relationshipLinks === "automatic") {
        const missing = await this.missingLinks(
          input.recordType,
          saved.map((item) => item.row),
          client,
        );
        for (const link of missing) {
          // eslint-disable-next-line no-await-in-loop
          await applyLink(this.pool, link, input.recordType, client);
        }
      }

      return recordId;
    });
    return { id };
  }

  /** Deletes a record and everything it created; a union it only reused is left alone. */
  async remove(id: string): Promise<void> {
    await inGraphTransaction(this.pool, async (client) => {
      const tx = createDatabase(client);
      const [record] = await tx.select().from(records).where(eq(records.id, id));
      if (!record) return;
      const rows = await tx.select().from(recordPeople).where(eq(recordPeople.recordId, id));
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        if (row.eventId) await this.removeEvent(tx, row.eventId);
        // eslint-disable-next-line no-await-in-loop
        if (row.associationId) await this.removeAssociation(tx, row.associationId);
      }
      if (record.unionId)
        await this.releaseUnion(tx, record.unionId, record.createdUnion, record.sourceId);
      await tx.delete(records).where(eq(records.id, id));
    });
  }

  /**
   * Linked rows whose age disagrees with the person's recorded birth by more
   * than a couple of years (`ageMismatch`) — for the data integrity check.
   */
  async ageMismatches(): Promise<RecordAgeMismatch[]> {
    const [settings, rows] = await Promise.all([
      this.settings.getRecordSettings(),
      this.db
        .select({
          row: recordPeople,
          recordType: records.recordType,
          censusKey: records.censusKey,
          date: records.date,
          personId: persons.id,
          given: persons.given,
          surname: persons.surname,
          birth: birthEvents.date,
        })
        .from(recordPeople)
        .innerJoin(records, eq(records.id, recordPeople.recordId))
        .innerJoin(persons, eq(persons.id, recordPeople.personId))
        .leftJoin(
          birthEvents,
          and(eq(birthEvents.personId, persons.id), eq(birthEvents.eventType, "birth")),
        ),
    ]);
    return rows.flatMap((item) => {
      const census = findCensus(item.censusKey, settings.customCensuses);
      const day = item.date?.earliest ?? item.date?.latest ?? census?.date ?? null;
      if (!day || item.row.age.trim() === "") return [];
      const yearsOff = ageMismatch(item.birth, item.row.age, day);
      if (yearsOff === null) return [];
      return [
        {
          personId: item.personId,
          personName: { given: item.given, surname: item.surname },
          birth: item.birth,
          recordId: item.row.recordId,
          recordType: recordTypeSchema.parse(item.recordType),
          censusKey: item.censusKey,
          year: Number(day.slice(0, 4)),
          age: item.row.age,
          yearsOff,
        },
      ];
    });
  }

  /** Moves a merged-away duplicate's record rows and searches onto the person kept. */
  async repointPerson(
    // A transaction, or the merge's own transaction-bound database.
    tx: Pick<Database, "update" | "delete">,
    removeId: string,
    keepId: string,
  ): Promise<void> {
    await tx
      .update(recordPeople)
      .set({ personId: keepId })
      .where(eq(recordPeople.personId, removeId));
    // One search per person and census: the kept person's own wins.
    await tx
      .delete(recordSearches)
      .where(
        and(
          eq(recordSearches.personId, removeId),
          sql`${recordSearches.censusKey} in (select ${recordSearches.censusKey} from ${recordSearches} where ${recordSearches.personId} = ${keepId})`,
        ),
      );
    await tx
      .update(recordSearches)
      .set({ personId: keepId })
      .where(eq(recordSearches.personId, removeId));
  }

  /**
   * The groom–bride union, kept in step: the same union while the couple
   * stays the same; otherwise an open union between them is reused (as
   * "Add spouse" does) or one is created — and a union this record created
   * for a couple it no longer names is deleted.
   */
  private async syncUnion(
    tx: Tx,
    client: PoolClient,
    recordId: string,
    previous: RecordRow | undefined,
    saved: Array<{ row: RecordPersonRow }>,
    input: RecordInput,
  ): Promise<{ id: string; personId: string } | null> {
    const groom = saved.find((item) => item.row.role === "groom")?.row.personId ?? null;
    const bride = saved.find((item) => item.row.role === "bride")?.row.personId ?? null;
    const values = {
      date: input.date,
      place: input.place.trim() === "" ? null : input.place,
    };

    let unionId: string | null = previous?.unionId ?? null;
    let created = previous?.createdUnion ?? false;
    if (unionId) {
      const [current] = await tx.select().from(unions).where(eq(unions.id, unionId));
      const samePair =
        current &&
        groom &&
        bride &&
        ((current.personAId === groom && current.personBId === bride) ||
          (current.personAId === bride && current.personBId === groom));
      if (!samePair) {
        if (current) await this.releaseUnion(tx, unionId, created, previous?.sourceId ?? null);
        unionId = null;
        created = false;
      }
    }

    if (!unionId && groom && bride) {
      const [open] = await tx
        .select({ id: unions.id })
        .from(unions)
        .where(
          and(
            or(
              and(eq(unions.personAId, groom), eq(unions.personBId, bride)),
              and(eq(unions.personAId, bride), eq(unions.personBId, groom)),
            ),
            isNull(unions.endDate),
          ),
        )
        .limit(1);
      if (open) {
        unionId = open.id;
        created = false;
      } else {
        const [inserted] = await tx
          .insert(unions)
          .values({ personAId: groom, personBId: bride, status: "married" })
          .returning({ id: unions.id });
        unionId = inserted!.id;
        created = true;
      }
      await addSpouseOf(this.pool, groom, bride, { client });
    }

    if (unionId) {
      // The record's date and place belong on a union it created; a reused
      // one only gets them where it had none.
      const [current] = await tx.select().from(unions).where(eq(unions.id, unionId));
      const patch = created
        ? { startDate: values.date, startPlace: values.place }
        : {
            ...(current?.startDate == null && values.date ? { startDate: values.date } : {}),
            ...(current?.startPlace == null && values.place ? { startPlace: values.place } : {}),
          };
      if (Object.keys(patch).length > 0) {
        await tx
          .update(unions)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(unions.id, unionId));
      }
    }

    await tx
      .update(records)
      .set({ unionId, createdUnion: created })
      .where(eq(records.id, recordId));
    return unionId && groom ? { id: unionId, personId: groom } : null;
  }

  /** The record's implied family links, minus those the graph already has. */
  private async missingLinks(
    type: RecordType,
    rows: ReadonlyArray<{ role: string; personId: string | null }>,
    client?: PoolClient,
  ): Promise<RelationshipCandidate[]> {
    const options = client ? { client } : {};
    const candidates = relationshipCandidates(type, rows);
    const missing: RelationshipCandidate[] = [];
    for (const candidate of candidates) {
      if (candidate.kind === "parent") {
        // eslint-disable-next-line no-await-in-loop
        const parents = await parentsOf(this.pool, candidate.childId, options);
        if (!parents.some((parent) => parent.personId === candidate.parentId))
          missing.push(candidate);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const spouses = await spousesOf(this.pool, candidate.aId, options);
        if (!spouses.some((spouse) => spouse.personId === candidate.bId)) missing.push(candidate);
      }
    }
    return missing;
  }

  private async removeEvent(tx: Tx, eventId: string): Promise<void> {
    await tx
      .delete(citations)
      .where(and(eq(citations.factType, "event"), eq(citations.factId, eventId)));
    await tx.delete(personEvents).where(eq(personEvents.id, eventId));
  }

  private async removeAssociation(tx: Tx, associationId: string): Promise<void> {
    await tx
      .delete(citations)
      .where(and(eq(citations.factType, "association"), eq(citations.factId, associationId)));
    await tx.delete(associations).where(eq(associations.id, associationId));
  }

  /**
   * A union the record no longer stands behind: one it created is deleted
   * (with its citations); one it only reused stays, minus the citation of
   * the record's own source.
   */
  private async releaseUnion(
    tx: Tx,
    unionId: string,
    created: boolean,
    sourceId: string | null,
  ): Promise<void> {
    if (created) {
      await this.removeUnion(tx, unionId);
    } else if (sourceId) {
      await tx
        .delete(citations)
        .where(
          and(
            eq(citations.factType, "union"),
            eq(citations.factId, unionId),
            eq(citations.sourceId, sourceId),
          ),
        );
    }
  }

  /** A union this record created, with its citations; its witnesses' roles are removed too. */
  private async removeUnion(tx: Tx, unionId: string): Promise<void> {
    await tx
      .delete(citations)
      .where(and(eq(citations.factType, "union"), eq(citations.factId, unionId)));
    await tx.delete(unions).where(eq(unions.id, unionId));
  }

  /**
   * The record's citation on an event or union. A citation from the
   * record's (previous) source is replaced; any other citations someone
   * added by hand are left alone.
   */
  private async syncCitation(
    tx: Tx,
    link: {
      factType: "event" | "union";
      factId: string;
      personId: string;
      previousSourceId: string | null;
      input: RecordInput;
      confidence: string;
    },
  ): Promise<void> {
    const forFact = and(eq(citations.factType, link.factType), eq(citations.factId, link.factId));
    for (const sourceId of new Set([link.previousSourceId, link.input.sourceId])) {
      if (!sourceId) continue;
      // eslint-disable-next-line no-await-in-loop
      await tx.delete(citations).where(and(forFact, eq(citations.sourceId, sourceId)));
    }
    if (!link.input.sourceId) return;
    await tx.insert(citations).values({
      sourceId: link.input.sourceId,
      personId: link.personId,
      factType: link.factType,
      factId: link.factId,
      page: link.input.page.trim() === "" ? null : link.input.page,
      entryId: link.input.reference.trim() === "" ? null : link.input.reference,
      confidence: link.confidence,
    });
  }

  /** `household_position` keys to their labels, so a census event says "Son", not "son". */
  private async positionLabels(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ key: configurableOptions.key, label: configurableOptions.label })
      .from(configurableOptions)
      .where(eq(configurableOptions.topic, "household_position"));
    return new Map(rows.map((row) => [row.key, row.label]));
  }
}

/** A suggested family link, made — parentage "birth" at a baptism, "unknown" from anything else. */
export async function applyLink(
  pool: Pool,
  link: RelationshipCandidate,
  type: RecordType,
  client: PoolClient,
): Promise<void> {
  if (link.kind === "parent") {
    await addParentOf(pool, link.parentId, link.childId, type === "baptism" ? "birth" : "unknown", {
      client,
    });
  } else {
    await addSpouseOf(pool, link.aId, link.bId, { client });
  }
}

/** The event details a record gives its principal, by type — the keys `eventDetailFields` shows. */
function eventDetails(
  input: RecordInput,
  person: RecordInput["people"][number],
  extra: { position: string; birthplace: string; officiant: string },
): Record<string, string> {
  switch (input.recordType) {
    case "census":
      return {
        age: person.age,
        position: extra.position,
        maritalStatus: person.maritalStatus,
        occupation: person.occupation,
        birthplace: extra.birthplace,
        address: input.address,
        household: input.reference,
      };
    case "baptism":
      return { church: input.address, officiant: extra.officiant };
    case "burial":
      return { cemetery: input.address, age: person.age };
    default:
      return {};
  }
}

/** Drops empty values, so an event's details only list what the record said. */
function compact(details: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value.trim() !== ""));
}
