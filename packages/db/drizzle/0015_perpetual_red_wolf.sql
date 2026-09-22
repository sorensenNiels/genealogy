CREATE TABLE "configurable_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configurable_options_topic_key_unique" UNIQUE("topic","key")
);
--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "confidence" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "confidence" SET DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE "person_events" ALTER COLUMN "event_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "person_names" ALTER COLUMN "name_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "unions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "unions" ALTER COLUMN "status" SET DEFAULT 'married';--> statement-breakpoint
CREATE INDEX "configurable_options_topic_idx" ON "configurable_options" USING btree ("topic","sort_order");--> statement-breakpoint
DROP TYPE "public"."confidence";--> statement-breakpoint
DROP TYPE "public"."event_type";--> statement-breakpoint
DROP TYPE "public"."name_variant_type";--> statement-breakpoint
DROP TYPE "public"."union_status";--> statement-breakpoint
INSERT INTO "configurable_options" ("topic", "key", "label", "sort_order", "is_protected") VALUES
('event_type', 'christening', 'Christening', 0, false),
('event_type', 'burial', 'Burial', 1, false),
('event_type', 'cremation', 'Cremation', 2, false),
('event_type', 'immigration', 'Immigration', 3, false),
('event_type', 'emigration', 'Emigration', 4, false),
('event_type', 'naturalization', 'Naturalization', 5, false),
('event_type', 'residence', 'Residence', 6, false),
('event_type', 'occupation', 'Occupation', 7, false),
('event_type', 'other', 'Other', 8, true),
('name_variant_type', 'birth', 'Birth name', 0, false),
('name_variant_type', 'married', 'Married', 1, false),
('name_variant_type', 'nickname', 'Nickname', 2, false),
('name_variant_type', 'preferred_name', 'Preferred name', 3, false),
('name_variant_type', 'alternate_spelling', 'Alternate spelling', 4, false),
('name_variant_type', 'other', 'Other', 5, false),
('confidence', 'low', 'Low', 0, false),
('confidence', 'medium', 'Medium', 1, false),
('confidence', 'high', 'High', 2, false),
('confidence', 'proven', 'Proven', 3, false),
('union_status', 'married', 'Married', 0, false),
('union_status', 'divorced', 'Divorced', 1, false),
('union_status', 'partnership', 'Partnership', 2, false),
('union_status', 'annulled', 'Annulled', 3, false),
('union_status', 'widowed', 'Widowed', 4, false),
('parentage', 'birth', 'Birth', 0, true),
('parentage', 'adopted', 'Adopted', 1, false),
('parentage', 'step', 'Step', 2, false),
('parentage', 'foster', 'Foster', 3, false),
('parentage', 'unknown', 'Unknown', 4, false);