import type { EventDetails, HistoricalDate } from "@genealogy/core";
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

    given: text("given").notNull().default(""),
    middleName: text("middle_name"),
    surname: text("surname").notNull().default(""),
    sex: sexEnum("sex").notNull().default("U"),

    // Single-valued, unlike the name history in `personNames` below.
    titlePrefix: text("title_prefix"),
    suffix: text("suffix"),

    // Plain strings rather than rows in `personNames`: nicknames don't carry
    // their own note/citation like an alternate name does, just an ordered list.
    nickname: text("nickname").array().notNull().default([]),

    // A filename under UPLOADS_DIR (see apps/backend/src/config/env.ts), not
    // a URL — the frontend builds the URL by joining it with the backend's
    // own origin, so this stays portable across environments.
    photoPath: text("photo_path"),

    // Stored as jsonb rather than `date` because genealogical dates are ranges
    // and approximations more often than they are days. See HistoricalDate.
    birth: jsonb("birth").$type<HistoricalDate>(),
    birthPlace: text("birth_place"),
    death: jsonb("death").$type<HistoricalDate>(),
    deathPlace: text("death_place"),

    // A deliberate flag rather than an inference from `death` — see the
    // matching comment on Person in packages/core/src/person.ts.
    isLiving: boolean("is_living").notNull().default(true),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("persons_surname_idx").on(table.surname, table.given)],
);

export const nameVariantTypeEnum = pgEnum("name_variant_type", [
  "maiden",
  "married",
  "alternate_spelling",
  "other",
]);

/**
 * A name a person was also known by — maiden name, married name(s), spelling
 * variants found in records. Its own table rather than an array column
 * because each variant carries its own note and there can be any number.
 */
export const personNames = pgTable(
  "person_names",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    nameType: nameVariantTypeEnum("name_type").notNull(),
    given: text("given").notNull().default(""),
    surname: text("surname").notNull().default(""),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("person_names_person_idx").on(table.personId)],
);

export const eventTypeEnum = pgEnum("event_type", [
  "christening",
  "burial",
  "cremation",
  "immigration",
  "emigration",
  "naturalization",
  "residence",
  "occupation",
  "other",
]);

/**
 * Life events beyond birth/death, which stay as columns on `persons` since
 * every person has exactly one of each. Everything here — residence history
 * and occupations especially — can happen zero to many times per person,
 * which is what a separate table buys over more `persons` columns.
 */
export const personEvents = pgTable(
  "person_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    eventType: eventTypeEnum("event_type").notNull(),
    // Distinguishes one "other" event from another; named types don't need it.
    label: text("label"),
    date: jsonb("date").$type<HistoricalDate>(),
    place: text("place"),
    // A loose key/value bag (ship name + port, employer + job title, cemetery
    // + plot) rather than a rigid per-type schema — see EventDetails.
    details: jsonb("details").$type<EventDetails>(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("person_events_person_idx").on(table.personId)],
);

export const unionStatusEnum = pgEnum("union_status", [
  "married",
  "divorced",
  "partnership",
  "annulled",
  "widowed",
]);

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
    status: unionStatusEnum("status").notNull().default("married"),
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

export const confidenceEnum = pgEnum("confidence", ["low", "medium", "high", "proven"]);

export const citationFactTypeEnum = pgEnum("citation_fact_type", [
  "person",
  "birth",
  "death",
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
 * has no polymorphic FK. It's null for "person"/"birth"/"death", which don't
 * have a row of their own to point at — `personId` + `factType` alone
 * identifies those. The application is responsible for clearing citations
 * whose fact row was deleted (see `removeName`/`removeEvent` in
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
    confidence: confidenceEnum("confidence").notNull().default("medium"),
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

export const schema = {
  persons,
  personNames,
  personEvents,
  unions,
  sources,
  citations,
  sexEnum,
  nameVariantTypeEnum,
  eventTypeEnum,
  unionStatusEnum,
  confidenceEnum,
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
