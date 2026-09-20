CREATE TYPE "public"."confidence" AS ENUM('low', 'medium', 'high', 'proven');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('M', 'F', 'U');--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"page" text,
	"confidence" "confidence" DEFAULT 'medium' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"given" text DEFAULT '' NOT NULL,
	"surname" text DEFAULT '' NOT NULL,
	"patronymic" text,
	"sex" "sex" DEFAULT 'U' NOT NULL,
	"birth" jsonb,
	"birth_place" text,
	"death" jsonb,
	"death_place" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"publication" text,
	"repository" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citations_person_idx" ON "citations" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "persons_surname_idx" ON "persons" USING btree ("surname","given");