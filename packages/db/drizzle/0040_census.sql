CREATE TABLE "census_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"age" text DEFAULT '' NOT NULL,
	"sex" text DEFAULT 'U' NOT NULL,
	"marital_status" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"occupation" text DEFAULT '' NOT NULL,
	"birthplace" text DEFAULT '' NOT NULL,
	"person_id" uuid,
	"event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "census_households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"census_year" integer NOT NULL,
	"census_date" jsonb,
	"place" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"household_number" text DEFAULT '' NOT NULL,
	"source_id" uuid,
	"page" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "census_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"census_year" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "census_searches_person_year_unique" UNIQUE("person_id","census_year")
);
--> statement-breakpoint
ALTER TABLE "census_entries" ADD CONSTRAINT "census_entries_household_id_census_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."census_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "census_entries" ADD CONSTRAINT "census_entries_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "census_entries" ADD CONSTRAINT "census_entries_event_id_person_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."person_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "census_households" ADD CONSTRAINT "census_households_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "census_searches" ADD CONSTRAINT "census_searches_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "census_entries_household_idx" ON "census_entries" USING btree ("household_id","sort_order");--> statement-breakpoint
CREATE INDEX "census_entries_person_idx" ON "census_entries" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "census_households_year_idx" ON "census_households" USING btree ("census_year");--> statement-breakpoint
-- The census event type that census households create for each linked person
-- (and that the GEDCOM import's CENS mapping looks for). ON CONFLICT: a
-- database where someone already added it keeps theirs.
INSERT INTO "configurable_options" ("topic", "key", "label", "sort_order", "is_protected") VALUES
('event_type', 'census', 'Census', 7, true)
ON CONFLICT ("topic", "key") DO NOTHING;--> statement-breakpoint
-- Positions in a census household. "other" is protected, like every topic's.
INSERT INTO "configurable_options" ("topic", "key", "label", "sort_order", "is_protected") VALUES
('household_position', 'head', 'Head of household', 0, false),
('household_position', 'wife', 'Wife', 1, false),
('household_position', 'husband', 'Husband', 2, false),
('household_position', 'son', 'Son', 3, false),
('household_position', 'daughter', 'Daughter', 4, false),
('household_position', 'child', 'Child', 5, false),
('household_position', 'stepchild', 'Stepchild', 6, false),
('household_position', 'foster_child', 'Foster child', 7, false),
('household_position', 'grandchild', 'Grandchild', 8, false),
('household_position', 'parent', 'Parent', 9, false),
('household_position', 'sibling', 'Sibling', 10, false),
('household_position', 'in_law', 'In-law', 11, false),
('household_position', 'servant', 'Servant', 12, false),
('household_position', 'lodger', 'Lodger', 13, false),
('household_position', 'other', 'Other', 14, true)
ON CONFLICT ("topic", "key") DO NOTHING;
