import type { EventDetails, HistoricalDate } from "@genealogy/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const sexEnum = pgEnum("sex", ["M", "F", "U"]);

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
    sex: sexEnum("sex").notNull().default("U"),

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

/** A record a claim can be cited from: a parish register, a census, a headstone. */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  author: text("author"),
  publication: text("publication"),
  repository: text("repository"),
  // Free text, not an enum: "1920 US Federal Census", "parish register",
  // "land deed" — this vocabulary is too open-ended for a closed enum, unlike
  // `confidence` below.
  sourceType: text("source_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const citationFactTypeEnum = pgEnum("citation_fact_type", [
  "person",
  "name",
  "event",
  "union",
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
 * The one app-owned table that reaches into better-auth's `user` — every
 * other reference to it (`session.userId`, `account.userId`) belongs to
 * better-auth itself. Holds what's specific to a logged-in account rather
 * than to a person record: which person in the tree they are (if any) and
 * their phone number. `personId` is nullable — an account with no linked
 * person just has no "this is you" badge or relationship-to-viewer
 * computation (see `PersonService.relationshipToRoot`) — and at most one
 * account can claim any given person, enforced by the partial unique index
 * below rather than in application code alone, so a bug can't silently let
 * two accounts both claim to be the same person.
 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
    phoneNumber: text("phone_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_profiles_person_id_idx")
      .on(table.personId)
      .where(sql`${table.personId} is not null`),
  ],
);

export const schema = {
  persons,
  personNames,
  personEvents,
  unions,
  sources,
  citations,
  configurableOptions,
  personImmichLinks,
  userProfiles,
  researchNotes,
  sexEnum,
  citationFactTypeEnum,
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
export type SourceRow = typeof sources.$inferSelect;
export type CitationRow = typeof citations.$inferSelect;
export type ConfigurableOptionRow = typeof configurableOptions.$inferSelect;
export type PersonImmichLinkRow = typeof personImmichLinks.$inferSelect;
export type UserProfileRow = typeof userProfiles.$inferSelect;
export type ResearchNoteRow = typeof researchNotes.$inferSelect;
