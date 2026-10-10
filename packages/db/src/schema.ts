import type { EventDetails, HistoricalDate } from "@genealogy/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const genderEnum = pgEnum("gender", ["M", "F", "U"]);

/**
 * The relational half of a person. The graph half — who their parents and
 * spouses are — lives as a `Person` node in the AGE graph keyed by this same
 * id. Keep them in step: every insert here must create the matching node.
 */
export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // A short, memorable identifier distinct from `id` above — meant to be
    // read aloud, written down, or shared, which the UUID isn't. Generated
    // once at creation (see generatePublicId in the backend) and never
    // changes; the backend retries on a collision, which `unique()` here is
    // what makes detectable. The DB also enforces the "starts with a letter,
    // rest is A-Z0-9" shape via a CHECK constraint added directly in the
    // migration (not expressible in the Drizzle schema builder), since this
    // column is never user-editable and Drizzle doesn't need to know about it.
    publicId: text("public_id").notNull().unique(),

    // No separate middle-name column — displayed as "First names" everywhere,
    // this holds every given name a person has, middle ones included.
    given: text("given").notNull().default(""),
    surname: text("surname").notNull().default(""),
    gender: genderEnum("gender").notNull().default("U"),

    // Single-valued, unlike the name history in `personNames` below.
    titlePrefix: text("title_prefix"),
    suffix: text("suffix"),

    // A filename under UPLOADS_DIR (see apps/backend/src/config/env.ts), not
    // a URL — the frontend builds the URL by joining it with the backend's
    // own origin, so this stays portable across environments.
    photoPath: text("photo_path"),

    // No birth/death columns here — they're ordinary `person_events` rows
    // (eventType "birth"/"death"), exactly like christening or burial, not a
    // special case. See "Birth and death are events" in TECH_STACK.md for why,
    // and `personsWithVitals` in vitals.ts for how the API still hands back a
    // `{birth, birthPlace, death, deathPlace}` shape despite that.

    // A deliberate flag rather than an inference from `death` — see the
    // matching comment on Person in packages/core/src/person.ts.
    isLiving: boolean("is_living").notNull().default(true),

    // GEDCOM's RESN — privacy/confidential/locked, or null for none. Plain
    // text validated by `personRestrictionSchema` (plus a CHECK constraint in
    // the migration), not a pgEnum: structural, but not worth an enum type.
    restriction: text("restriction"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("persons_surname_idx").on(table.surname, table.given)],
);

/**
 * A name a person was also known by — birth name, married name(s), a
 * nickname, spelling variants found in records. Its own table rather than an
 * array column because each variant carries its own note and there can be
 * any number.
 */
export const personNames = pgTable(
  "person_names",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    // Plain text, not an enum: the set of name-variant types is
    // user-configurable (see `configurableOptions` below, topic
    // "name_variant_type") — a new one must not require a migration.
    nameType: text("name_type").notNull(),
    given: text("given").notNull().default(""),
    surname: text("surname").notNull().default(""),
    // Jsonb for the same reason as persons.birth/death: genealogical dates are
    // ranges and approximations more often than they are exact days.
    since: jsonb("since").$type<HistoricalDate>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("person_names_person_idx").on(table.personId)],
);

/**
 * Every dated life event a person has — birth and death included. Residence
 * and occupation especially can happen zero to many times per person, which
 * is what a separate table buys over columns on `persons`; birth and death
 * are structurally no different from christening or burial (a date, a place,
 * type-specific detail, evidence via `citations`), so they live here too
 * rather than being special-cased as `persons` columns the way they used to
 * be — see "Birth and death are events" in TECH_STACK.md. The application
 * still treats "birth"/"death" as at-most-one-per-person (enforced in
 * `PersonService.addEvent`, not by this table), and the person page still
 * edits them as a dedicated pair of fields rather than through the generic
 * add-event flow — `vitals.ts`'s `personsWithVitals` is what reassembles them
 * onto the API's person shape for that.
 */
export const personEvents = pgTable(
  "person_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    // Plain text, not an enum: the set of event types is user-configurable
    // (see `configurableOptions` below, topic "event_type") — a new one must
    // not require a migration. The literals "birth"/"death"/"other" are still
    // meaningful to application code (see person-event.ts and
    // `PersonService`); all three are seeded as protected, undeletable
    // options rather than enforced by this column's type.
    eventType: text("event_type").notNull(),
    // Distinguishes one "other" event from another; named types don't need it.
    label: text("label"),
    date: jsonb("date").$type<HistoricalDate>(),
    place: text("place"),
    // A loose key/value bag (ship name + port, employer + job title, cemetery
    // + plot) rather than a rigid per-type schema — see EventDetails.
    details: jsonb("details").$type<EventDetails>(),
    // Free-form markdown, same convention as `persons.notes`/`unions.notes`/
    // `personNames.notes` — edited with `MarkdownEditor`, rendered with
    // `MarkdownContent`, never a plain text field. Was "description" (a plain
    // `Input`) until 2026-09-23.
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("person_events_person_idx").on(table.personId)],
);

/**
 * The evidence-backed detail of a spousal relationship. Deliberately
 * relational rather than properties on the `SPOUSE_OF` graph edge, for the
 * same reason `citations` below is: graph edges stay thin, evidence lives
 * here. A pair can have more than one union over time (divorced, remarried),
 * which a single edge property couldn't express.
 */
export const unions = pgTable(
  "unions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personAId: uuid("person_a_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    personBId: uuid("person_b_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    // Plain text, not an enum: the set of union statuses is
    // user-configurable (see `configurableOptions` below, topic
    // "union_status") — a new one must not require a migration.
    status: text("status").notNull().default("married"),
    startDate: jsonb("start_date").$type<HistoricalDate>(),
    startPlace: text("start_place"),
    // Separation, divorce, or the death of a spouse — whatever ended it.
    endDate: jsonb("end_date").$type<HistoricalDate>(),
    endPlace: text("end_place"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("unions_person_a_idx").on(table.personAId),
    index("unions_person_b_idx").on(table.personBId),
  ],
);

/**
 * Coordinates for a place, keyed by its text exactly as events and unions
 * store it ("Brande, Ribe, Danmark") — coordinates belong to the place, not
 * to each event at it, so one row serves every event there. Places stay
 * plain text everywhere else; this is a lookup beside them, not a foreign
 * key target (see "GEDCOM import" in TECH_STACK.md for why).
 *
 * `location` is a PostGIS point (SRID 4326, x = longitude, y = latitude) so
 * spatial queries ("everyone born within 20 km of here") work directly when
 * a map view arrives. PostGIS is created by this table's migration, which is
 * deliberately the last in its batch — a server without the PostGIS
 * packages fails there without holding back the migrations before it.
 */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("places_location_idx").using("gist", table.location)],
);

/**
 * Someone named in a role on a person's record — a godparent at a baptism, a
 * witness at a marriage (GEDCOM's `ASSO`); see `associationSchema` in
 * packages/core. Relational rather than a graph edge, for the same reason
 * `unions` is: edges stay thin, and this carries a role, notes and
 * citations (`citations.factType = "association"`).
 *
 * `eventId`/`unionId` are `set null` on delete: losing the baptism record
 * doesn't make someone stop having been the godparent, it just unties the
 * role from that event. `associatePersonId` cascades — the row means nothing without the
 * associate — and `PersonService.remove` clears the citations that pointed
 * at rows removed that way, since `citations.factId` isn't a real FK.
 */
export const associations = pgTable(
  "associations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => personEvents.id, { onDelete: "set null" }),
    // A marriage witness belongs to the marriage, which is a `unions` row,
    // not one of the person's events. At most one of eventId/unionId is set;
    // neither means the role isn't tied to a specific record.
    unionId: uuid("union_id").references(() => unions.id, { onDelete: "set null" }),
    associatePersonId: uuid("associate_person_id").references(() => persons.id, {
      onDelete: "cascade",
    }),
    // The associate as written, when they aren't (and may never be) a person
    // in the tree — exactly one of this and `associatePersonId` is set.
    associateName: text("associate_name"),
    // Plain text, not an enum: user-configurable (topic "association_role").
    role: text("role").notNull(),
    // Required for role "other", like an "other" event's label.
    label: text("label"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("associations_person_idx").on(table.personId),
    index("associations_associate_idx").on(table.associatePersonId),
    check("associations_one_context", sql`${table.eventId} is null or ${table.unionId} is null`),
    check(
      "associations_one_associate",
      sql`(${table.associatePersonId} is null) <> (${table.associateName} is null)`,
    ),
  ],
);

/** A record a claim can be cited from: a parish register, a census, a headstone. */
/**
 * An archive or library holding sources — GEDCOM's REPO record. Its own
 * table (rather than free text on each source) because many sources share
 * one repository, and its address and contact details belong to it, not to
 * any one source. Not deduplicated by name: two archives can share a name.
 */
export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  author: text("author"),
  publication: text("publication"),
  repositoryId: uuid("repository_id").references(() => repositories.id, {
    onDelete: "set null",
  }),
  /** The source's shelf mark in its repository — GEDCOM's REPO.CALN. */
  callNumber: text("call_number"),
  // Free text, not an enum: "1920 US Federal Census", "parish register",
  // "land deed" — this vocabulary is too open-ended for a closed enum, unlike
  // `confidence` below.
  sourceType: text("source_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A person's id in another system: FamilySearch (`_FSFTID`), Ancestry
 * (`_APID` on a person), a user reference number (`REFN`, with its TYPE), or
 * a GEDCOM 7 `EXID` (with its TYPE URI). `system` is structural — the GEDCOM
 * exporter branches on it — so it's checked against
 * `personExternalIdSystemSchema` (plus a CHECK constraint in the migration)
 * rather than being a configurable option.
 */
export const personExternalIds = pgTable(
  "person_external_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    system: text("system").notNull(),
    value: text("value").notNull(),
    /** REFN's TYPE or EXID's TYPE URI, as written; null otherwise. */
    type: text("type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("person_external_ids_unique").on(table.personId, table.system, table.value),
    index("person_external_ids_person_idx").on(table.personId),
  ],
);

export const citationFactTypeEnum = pgEnum("citation_fact_type", [
  "person",
  "name",
  "event",
  "union",
  "association",
]);

/**
 * Evidence linking a source to a person, or to one specific fact about them.
 * Graph edges stay deliberately thin, so the evidence for a relationship is
 * cited against the people (and, via `union`, the union row) it connects.
 *
 * `factId` is deliberately not a foreign key: which table it points into
 * depends on `factType` (`personNames`/`personEvents`/`unions`), and Postgres
 * has no polymorphic FK. It's null only for "person" (evidence for the person
 * as a whole, not one fact), where `personId` + `factType` alone identifies
 * it — birth and death used to be a second null-`factId` case here too,
 * before they became ordinary `person_events` rows with a real id (see
 * `personEvents` above). The application is responsible for clearing
 * citations whose fact row was deleted (see `removeName`/`removeEvent` in
 * `person.service.ts`), since the database can't cascade a reference it
 * doesn't know is a foreign key.
 */
export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    factType: citationFactTypeEnum("fact_type").notNull().default("person"),
    factId: uuid("fact_id"),
    page: text("page"),
    volume: text("volume"),
    entryId: text("entry_id"),
    certificateNumber: text("certificate_number"),
    // Plain text, not an enum: the set of confidence levels is
    // user-configurable (see `configurableOptions` below, topic
    // "confidence") — a new one must not require a migration.
    confidence: text("confidence").notNull().default("medium"),
    note: text("note"),
    /**
     * Ancestry's `_APID` — a pointer to the record in one of its databases
     * (`1,7602::2771226`), which Ancestry writes on citations. Kept so it
     * round-trips through GEDCOM; nothing else reads it.
     */
    ancestryApid: text("ancestry_apid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("citations_person_idx").on(table.personId),
    index("citations_fact_idx").on(table.factType, table.factId),
  ],
);

/**
 * better-auth's core schema (user/session/account/verification), field shapes
 * and table names dictated by better-auth itself so its Drizzle adapter can
 * find them unconfigured — see apps/backend/src/auth/auth.module.ts. IDs are
 * generated by better-auth, not the database, so they're plain text rather
 * than the defaultRandom() uuid the rest of this file uses.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /**
   * admin | editor | viewer — `memberRoleSchema` in `@genealogy/core`, plus a
   * CHECK constraint in the migration. A better-auth `additionalFields`
   * entry (`input: false`, so a client can't pick its own role at sign-up),
   * which also puts it on every session's `user` with no extra query.
   */
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An admin's invitation to join. Sign-up is invite-only (see the
 * `databaseHooks` in `auth.module.ts`): a new account needs a pending,
 * unexpired invitation for its email. The link's secret is never stored —
 * only its SHA-256 hash — so a database read doesn't hand out working links.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lower-cased; matched case-insensitively against the new account's email. */
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
    message: text("message"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("invitations_email_idx").on(table.email)],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/** One authentication method linked to a user — email/password is providerId "credential". */
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/**
 * The options offered in a "closed vocabulary" dropdown — event types,
 * alternate-name types, confidence levels, union statuses, parentage types
 * (see `ConfigurableTopic` in packages/core) — editable from the Settings
 * page instead of requiring a code change + migration for every new value.
 *
 * `key` is what referencing rows actually store (`personEvents.eventType`,
 * `citations.confidence`, ...) and is immutable once created; only `label`
 * and `sortOrder` can be edited afterwards, so renaming or reordering an
 * option never orphans existing data. `isProtected` marks the handful of
 * keys application code branches on directly (event_type's "other",
 * parentage's "birth") — those can be relabeled but never deleted.
 */
export const configurableOptions = pgTable(
  "configurable_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isProtected: boolean("is_protected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("configurable_options_topic_key_unique").on(table.topic, table.key),
    index("configurable_options_topic_idx").on(table.topic, table.sortOrder),
  ],
);

/**
 * A record entered as written — a census household, a baptism, a marriage,
 * a burial (see "Records" in TECH_STACK.md and `RECORD_TEMPLATES` in core):
 * what, when, where, and the source. Its people are `recordPeople`. What the
 * record means for each linked person — an event, a union, a godparent or
 * witness role — is made from it and kept in step by `RecordService`.
 */
export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** A `recordTypeSchema` value; its template decides what saving creates. */
    recordType: text("record_type").notNull(),
    /** For a census: the census definition's key (`dk-1845`, `us-1880`, a custom one). */
    censusKey: text("census_key"),
    date: jsonb("date").$type<HistoricalDate>(),
    /** Parish, village or town. */
    place: text("place").notNull().default(""),
    /** Address or farm (census), church (baptism/marriage) or cemetery (burial). */
    address: text("address").notNull().default(""),
    /** Household number (census) or entry number. */
    reference: text("reference").notNull().default(""),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    page: text("page").notNull().default(""),
    /** The scan (Rigsarkivet, DDD, FamilySearch, ...). */
    url: text("url").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /**
     * A marriage's union between the groom and bride, and whether this
     * record created it (then deleting the record deletes it) or found it
     * already there (then it's left alone).
     */
    unionId: uuid("union_id").references(() => unions.id, { onDelete: "set null" }),
    createdUnion: boolean("created_union").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("records_type_idx").on(table.recordType),
    index("records_census_key_idx").on(table.censusKey),
  ],
);

/**
 * One person named in a record, as written. `personId` links the row to
 * someone in the tree (null for a servant or godparent nobody has
 * identified); `eventId` is the event the link created (the principal's
 * census/christening/burial event), `associationId` the godparent/witness
 * role — both kept in step by `RecordService` and removed with the row.
 */
export const recordPeople = pgTable(
  "record_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** A template role, or for a census a `household_position` option key. */
    role: text("role").notNull().default(""),
    name: text("name").notNull().default(""),
    sex: text("sex").notNull().default("U"),
    age: text("age").notNull().default(""),
    maritalStatus: text("marital_status").notNull().default(""),
    occupation: text("occupation").notNull().default(""),
    residence: text("residence").notNull().default(""),
    birthplace: text("birthplace").notNull().default(""),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => personEvents.id, { onDelete: "set null" }),
    associationId: uuid("association_id").references(() => associations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("record_people_record_idx").on(table.recordId, table.sortOrder),
    index("record_people_person_idx").on(table.personId),
  ],
);

/**
 * "Searched this census for this person, not found" — the third state of a
 * person's census coverage (found comes from `recordPeople`). One per person
 * and census.
 */
export const recordSearches = pgTable(
  "record_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    censusKey: text("census_key").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("record_searches_person_census_unique").on(table.personId, table.censusKey)],
);

/**
 * Site-wide settings, one row per section (`"tree"`, ...), the value a JSON
 * object validated by that section's Zod schema in `@genealogy/core`
 * (`treeSettingsSchema`, ...). Key/value rather than a column per setting
 * so a new setting is a schema default in code, not a migration; the
 * schemas give every field a default, so a missing row or field reads as
 * the default. Edited by admins on the Settings page.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Links a genealogy person to an Immich "Person" (a face-clustering result —
 * see "Photos & albums via Immich" in FEATURES.md). Many Immich person ids
 * can map to one genealogy person — the same real person photographed
 * decades apart plausibly lands in two separate face clusters — but
 * `immichPersonId` is unique on its own: one face cluster represents at most
 * one genealogy person. Immich's own `Person` object has no field for an
 * external id (checked its `PersonCreateDto`/`PersonUpdateDto` schema
 * directly), so this mapping has to live here, the same way
 * `citations.factId` resolves against a table this app owns rather than
 * something the external system tracks for us. No photo bytes or metadata
 * live here — this is purely the link; everything else is fetched live from
 * Immich through the backend proxy on every read.
 */
export const personImmichLinks = pgTable(
  "person_immich_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    immichPersonId: text("immich_person_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("person_immich_links_person_idx").on(table.personId)],
);

/**
 * A manual per-photo position within an Immich album — the one piece of
 * local state this Immich integration keeps; everywhere else Immich stays
 * sole source of truth (see TECH_STACK.md). Needed because Immich's own API
 * has no per-asset custom ordering, only a whole-album date ascending/
 * descending toggle (`AlbumResponseDto.order`) — nowhere to persist "the
 * user dragged this photo to the front" except here. `albumId`/`assetId`
 * are plain `text`, not foreign keys, for the same reason
 * `personImmichLinks.immichPersonId` is: they reference Immich's own ids,
 * not a row this database owns. A row with no matching Immich asset/album
 * anymore (removed elsewhere, e.g. via Immich's own UI) is simply ignored
 * when assembling an album's ordered asset list, then pruned — same "fails
 * open" philosophy as `personImmichLinks`'s own dangling-link handling.
 */
export const immichAlbumAssetOrder = pgTable(
  "immich_album_asset_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    albumId: text("album_id").notNull(),
    assetId: text("asset_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("immich_album_asset_order_album_asset_idx").on(table.albumId, table.assetId),
    index("immich_album_asset_order_album_idx").on(table.albumId, table.position),
  ],
);

/**
 * Local metadata for an Immich album — date, place, and more. Immich's own
 * album object has none of these, so this is layered on top the same way
 * `immichAlbumAssetOrder` layers on custom ordering: `albumId` is plain `text`,
 * not a foreign key, since it references Immich's own id, not a row this
 * database owns.
 *
 * `tags` is currently unused: album tags were taken out of the app in favor
 * of album categories (`albumCategories`), but the column and its data are
 * kept in case they come back. Nothing reads it, and `upsertAlbumMetadata`
 * never writes it, so existing tags survive edits. `date` reuses `HistoricalDate`, the same approximate/range date type
 * `personEvents.date` uses, so album dates get the same "circa 1950" handling.
 *
 * `kind` distinguishes a "physical" album (mirrors a real scanned album,
 * grows only via upload) from a "virtual" one (a curated collection that only
 * ever references assets already living in a physical album, never uploaded
 * to directly) — see `ImmichService.addAssetsToAlbum`/`createAlbumWithMetadata`
 * for where that distinction is enforced. Plain `text` with a default, not a
 * `pgEnum`, for the same migration-cost reason CLAUDE.md gives for avoiding
 * enums elsewhere: adding a third kind later would need its own `ALTER TYPE`
 * migration, whereas a default-and-validate-at-the-zod-boundary column just
 * needs a new accepted string. It's still a structural, code-branching field
 * (not a `configurableOptions` topic) — see `packages/core`'s `albumKindSchema`.
 * `kind` is set once at album creation and is immutable after — `upsertAlbumMetadata`
 * refuses to change an existing row's stored value.
 *
 * `cover`/`found`/`scanned`/`photosPerPage` are physical-album-only by
 * convention, not by a DB constraint (same relaxed-nullable pattern `place`
 * already uses): `cover` is the shelf-spine/book-cover color+style chosen at
 * creation; `found`/`scanned` are free-text provenance notes ("Brande, attic" /
 * "600 dpi, 2019"); `photosPerPage` drives the book-view reading mode's
 * auto-pagination over the album's existing flat asset order — deliberately
 * not a per-photo page number, since one "N per page" setting is enough and
 * needs no new per-asset storage.
 */
export const albumMetadata = pgTable("album_metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  albumId: text("album_id").notNull().unique(),
  date: jsonb("date").$type<HistoricalDate>(),
  place: text("place"),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  kind: text("kind").notNull().default("physical"),
  cover: jsonb("cover").$type<{ color: string; style: "foil" | "label" | "tooled" } | null>(),
  found: text("found"),
  scanned: text("scanned"),
  photosPerPage: integer("photos_per_page").notNull().default(4),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A user-defined grouping for albums (a family name, "Holidays", ...) — see
 * `albumCategoryIdSchema` in `@genealogy/core` for why this is its own table
 * rather than a `configurableOptions` topic. Names are unique
 * case-insensitively, so "Sørensen" and "sørensen" can't both exist.
 */
export const albumCategories = pgTable(
  "album_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("album_categories_name_lower_idx").on(sql`lower(${table.name})`)],
);

/**
 * Which albums are in which categories — many-to-many. `albumId` references
 * `album_metadata.album_id` (unique) rather than Immich directly, so deleting
 * an album's local metadata (`ImmichService.deleteAlbum`) or a category
 * cascades here with no extra cleanup code; an album gets a metadata row
 * before it can be categorized (`upsertAlbumMetadata` writes both).
 */
export const albumCategoryMembers = pgTable(
  "album_category_members",
  {
    albumId: text("album_id")
      .notNull()
      .references(() => albumMetadata.albumId, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => albumCategories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.albumId, table.categoryId] }),
    index("album_category_members_category_idx").on(table.categoryId),
  ],
);

/**
 * A research to-do tied to a person: an open question to chase down later, or
 * a plain note — distinguished by `noteType` (user-configurable, topic
 * "research_note_type"). `resolved` is deliberately independent of
 * `noteType`: an "Open question" note stays that type for history even after
 * it's been answered, so closing one is a status flip, not a retype/delete.
 */
export const researchNotes = pgTable(
  "research_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    noteType: text("note_type").notNull(),
    body: text("body").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("research_notes_person_idx").on(table.personId)],
);

/**
 * A private notebook entry for the logged-in account itself — not tied to
 * any person record, unlike `researchNotes`. Ownership is enforced in
 * `UserNoteService` (every query filters on `userId` from the session, never
 * from client input), not by a unique/partial index — there's no uniqueness
 * constraint to express here, just "don't show me someone else's notes".
 */
export const userNotes = pgTable(
  "user_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("user_notes_user_idx").on(table.userId)],
);

/**
 * A real `pgEnum`, not a `configurableOptions` topic — deliberately, per the
 * exception noted in CLAUDE.md: the frontend branches on the exact value
 * (which icon to show, what the action button says, where it navigates), so
 * it's structural rather than an admin-editable list. A new notification
 * type is a code change on both ends anyway (something has to produce it and
 * something has to render it), so a migration to add one costs nothing extra.
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "backup_ready",
  "immich_faces_rescanned",
  "restore_complete",
  "album_zip_ready",
  "static_site_ready",
]);

/**
 * System-generated, one-way notices for the logged-in account — "your
 * backup is ready", eventually things like an import finishing. Not a
 * messaging/inbox system: there's no sender, no thread, nothing a user
 * composes, just events this app itself produces. `actionUrl` is optional —
 * a purely informational notice has nothing to link to.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    actionUrl: text("action_url"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.createdAt)],
);

/**
 * One of two app-owned tables that reach into better-auth's `user` (the
 * other is `userNotes` above) — every other reference to it
 * (`session.userId`, `account.userId`) belongs to better-auth itself. Holds
 * what's specific to a logged-in account rather
 * than to a person record: which person in the tree they are (if any) and
 * their phone number. `personId` is nullable — an account with no linked
 * person just has no "this is you" badge or relationship-to-viewer
 * computation (see `PersonService.relationshipToRoot`) — and at most one
 * account can claim any given person, enforced by the partial unique index
 * below rather than in application code alone, so a bug can't silently let
 * two accounts both claim to be the same person.
 */
/**
 * Custom themes, made by admins on the Settings page and offered to every
 * member alongside the built-ins (which live in code — `BUILT_IN_THEMES` in
 * @genealogy/core). `definition` is a `ThemeDefinition` (colors for light and
 * dark, fonts, radius), validated with `themeDefinitionSchema` on write and
 * again on read before any of it becomes CSS.
 */
export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  definition: jsonb("definition").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
    phoneNumber: text("phone_number"),
    // No default/not-null — absence means "no preference set yet," resolved
    // to English at the read layer (see ProfileService), not baked in here.
    language: text("language"),
    // Where this member last had the tree ("remember where I was"), so
    // /tree with no person reopens there — on any device, and already on
    // the server-rendered first load. Chart and direction are plain text,
    // validated against `treeChartKindSchema`/`treeOrientationSchema` on
    // read, so a since-removed chart just falls back to the default.
    lastTreePersonId: uuid("last_tree_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    lastTreeView: text("last_tree_view"),
    lastTreeOrientation: text("last_tree_orientation"),
    // The member's own theme, overriding the site's (`app_settings` "theme").
    // A built-in slug ("heritage") or a `themes.id`; plain text, no foreign
    // key, since built-ins aren't rows — a theme deleted since just falls
    // back to the site default on read (see ThemeService).
    themeId: text("theme_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_profiles_person_id_idx")
      .on(table.personId)
      .where(sql`${table.personId} is not null`),
  ],
);

/**
 * Pairs of people an admin has looked at and marked "not a duplicate", so
 * duplicate detection (Tools → Possible duplicates) stops suggesting them.
 * Stored once per pair with the smaller id first — the check constraint
 * keeps (a, b) and (b, a) from both existing. Cascades with either person:
 * after a merge or delete there's no pair left to remember.
 */
export const duplicateDismissals = pgTable(
  "duplicate_dismissals",
  {
    personAId: uuid("person_a_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    personBId: uuid("person_b_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    dismissedBy: text("dismissed_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.personAId, table.personBId] }),
    index("duplicate_dismissals_person_b_idx").on(table.personBId),
    check("duplicate_dismissals_ordered", sql`${table.personAId} < ${table.personBId}`),
  ],
);

export const schema = {
  themes,
  persons,
  personNames,
  personEvents,
  unions,
  associations,
  places,
  sources,
  citations,
  configurableOptions,
  appSettings,
  records,
  recordPeople,
  recordSearches,
  personImmichLinks,
  immichAlbumAssetOrder,
  albumMetadata,
  userProfiles,
  researchNotes,
  userNotes,
  notifications,
  duplicateDismissals,
  genderEnum,
  citationFactTypeEnum,
  notificationTypeEnum,
  user,
  session,
  account,
  verification,
};

export type PersonRow = typeof persons.$inferSelect;
export type NewPersonRow = typeof persons.$inferInsert;
export type PersonNameRow = typeof personNames.$inferSelect;
export type PersonEventRow = typeof personEvents.$inferSelect;
export type UnionRow = typeof unions.$inferSelect;
export type AssociationRow = typeof associations.$inferSelect;
export type PlaceRow = typeof places.$inferSelect;
export type RepositoryRow = typeof repositories.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type PersonExternalIdRow = typeof personExternalIds.$inferSelect;
export type CitationRow = typeof citations.$inferSelect;
export type ConfigurableOptionRow = typeof configurableOptions.$inferSelect;
export type PersonImmichLinkRow = typeof personImmichLinks.$inferSelect;
export type ImmichAlbumAssetOrderRow = typeof immichAlbumAssetOrder.$inferSelect;
export type AlbumMetadataRow = typeof albumMetadata.$inferSelect;
export type UserProfileRow = typeof userProfiles.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;
export type ResearchNoteRow = typeof researchNotes.$inferSelect;
export type UserNoteRow = typeof userNotes.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
export type RecordPersonRow = typeof recordPeople.$inferSelect;
export type RecordSearchRow = typeof recordSearches.$inferSelect;
