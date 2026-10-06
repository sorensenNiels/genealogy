ALTER TYPE "public"."citation_fact_type" ADD VALUE IF NOT EXISTS 'association';--> statement-breakpoint
CREATE TABLE "associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"event_id" uuid,
	"union_id" uuid,
	"associate_person_id" uuid,
	"associate_name" text,
	"role" text NOT NULL,
	"label" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "associations_one_context" CHECK ("associations"."event_id" is null or "associations"."union_id" is null),
	CONSTRAINT "associations_one_associate" CHECK (("associations"."associate_person_id" is null) <> ("associations"."associate_name" is null))
);
--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "restriction" text;--> statement-breakpoint
ALTER TABLE "associations" ADD CONSTRAINT "associations_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associations" ADD CONSTRAINT "associations_event_id_person_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."person_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associations" ADD CONSTRAINT "associations_union_id_unions_id_fk" FOREIGN KEY ("union_id") REFERENCES "public"."unions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associations" ADD CONSTRAINT "associations_associate_person_id_persons_id_fk" FOREIGN KEY ("associate_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "associations_person_idx" ON "associations" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "associations_associate_idx" ON "associations" USING btree ("associate_person_id");--> statement-breakpoint
-- Not expressible in the Drizzle schema builder; mirrors `personRestrictionSchema`.
ALTER TABLE "persons" ADD CONSTRAINT "persons_restriction_check" CHECK ("restriction" IS NULL OR "restriction" IN ('privacy', 'confidential', 'locked'));--> statement-breakpoint
INSERT INTO "configurable_options" ("topic", "key", "label", "sort_order", "is_protected") VALUES
('association_role', 'godparent', 'Godparent', 0, false),
('association_role', 'witness', 'Witness', 1, false),
('association_role', 'informant', 'Informant', 2, false),
('association_role', 'officiant', 'Officiant', 3, false),
('association_role', 'other', 'Other', 4, true);
