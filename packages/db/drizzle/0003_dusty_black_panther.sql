CREATE TYPE "public"."event_type" AS ENUM('christening', 'burial', 'cremation', 'immigration', 'emigration', 'naturalization', 'residence', 'occupation', 'other');--> statement-breakpoint
CREATE TYPE "public"."name_variant_type" AS ENUM('maiden', 'married', 'alternate_spelling', 'other');--> statement-breakpoint
CREATE TYPE "public"."union_status" AS ENUM('married', 'divorced', 'partnership', 'annulled', 'widowed');--> statement-breakpoint
CREATE TABLE "person_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"event_type" "event_type" NOT NULL,
	"date" jsonb,
	"place" text,
	"details" jsonb,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name_type" "name_variant_type" NOT NULL,
	"given" text DEFAULT '' NOT NULL,
	"surname" text DEFAULT '' NOT NULL,
	"patronymic" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"status" "union_status" DEFAULT 'married' NOT NULL,
	"start_date" jsonb,
	"start_place" text,
	"end_date" jsonb,
	"end_place" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "volume" text;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "entry_id" text;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "certificate_number" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "title_prefix" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "suffix" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "person_events" ADD CONSTRAINT "person_events_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_names" ADD CONSTRAINT "person_names_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unions" ADD CONSTRAINT "unions_person_a_id_persons_id_fk" FOREIGN KEY ("person_a_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unions" ADD CONSTRAINT "unions_person_b_id_persons_id_fk" FOREIGN KEY ("person_b_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_events_person_idx" ON "person_events" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_names_person_idx" ON "person_names" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "unions_person_a_idx" ON "unions" USING btree ("person_a_id");--> statement-breakpoint
CREATE INDEX "unions_person_b_idx" ON "unions" USING btree ("person_b_id");