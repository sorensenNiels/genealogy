-- Birth and death become ordinary `person_events` rows instead of `persons`
-- columns (see "Birth and death are events" in TECH_STACK.md) — christening,
-- burial, and everything else already lived there; treating birth/death as
-- special columns was the inconsistency, not the other way round. This
-- migration is data-preserving: every person's existing birth/death moves
-- into `person_events`, and any citation that pointed at the old "birth"/
-- "death" fact type is repointed at the new row, all before the now-unused
-- columns and enum values are dropped below.

-- Seed the two new protected event types, sorted ahead of the existing ones
-- (christening is 0) so "Birth"/"Death" lead the dropdown.
INSERT INTO "configurable_options" ("topic", "key", "label", "sort_order", "is_protected") VALUES
('event_type', 'birth', 'Birth', -2, true),
('event_type', 'death', 'Death', -1, true);--> statement-breakpoint

WITH moved_births AS (
  INSERT INTO "person_events" ("person_id", "event_type", "date", "place")
  SELECT "id", 'birth', "birth", "birth_place"
  FROM "persons"
  WHERE "birth" IS NOT NULL OR "birth_place" IS NOT NULL
  RETURNING "id", "person_id"
)
UPDATE "citations"
SET "fact_type" = 'event', "fact_id" = "moved_births"."id"
FROM "moved_births"
WHERE "citations"."person_id" = "moved_births"."person_id" AND "citations"."fact_type" = 'birth';--> statement-breakpoint

WITH moved_deaths AS (
  INSERT INTO "person_events" ("person_id", "event_type", "date", "place")
  SELECT "id", 'death', "death", "death_place"
  FROM "persons"
  WHERE "death" IS NOT NULL OR "death_place" IS NOT NULL
  RETURNING "id", "person_id"
)
UPDATE "citations"
SET "fact_type" = 'event', "fact_id" = "moved_deaths"."id"
FROM "moved_deaths"
WHERE "citations"."person_id" = "moved_deaths"."person_id" AND "citations"."fact_type" = 'death';--> statement-breakpoint

-- Narrows citation_fact_type now that nothing references "birth"/"death"
-- anymore — Postgres has no ALTER TYPE ... DROP VALUE, so this recreates the
-- type. Must run after the data move above and before the persons columns
-- are dropped below.
ALTER TABLE "citations" ALTER COLUMN "fact_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "fact_type" SET DEFAULT 'person'::text;--> statement-breakpoint
DROP TYPE "public"."citation_fact_type";--> statement-breakpoint
CREATE TYPE "public"."citation_fact_type" AS ENUM('person', 'name', 'event', 'union');--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "fact_type" SET DEFAULT 'person'::"public"."citation_fact_type";--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "fact_type" SET DATA TYPE "public"."citation_fact_type" USING "fact_type"::"public"."citation_fact_type";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "birth";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "birth_place";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "death";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "death_place";
