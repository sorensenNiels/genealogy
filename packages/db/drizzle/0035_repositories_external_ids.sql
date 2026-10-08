CREATE TABLE "person_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"system" text NOT NULL,
	"value" text NOT NULL,
	"type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_external_ids_unique" UNIQUE("person_id","system","value")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "ancestry_apid" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "repository_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "call_number" text;--> statement-breakpoint
ALTER TABLE "person_external_ids" ADD CONSTRAINT "person_external_ids_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_external_ids_person_idx" ON "person_external_ids" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_external_ids" ADD CONSTRAINT "person_external_ids_system_check" CHECK ("system" IN ('familysearch', 'ancestry', 'refn', 'exid'));--> statement-breakpoint
-- Each distinct repository name already on a source becomes one repository,
-- matching how the GEDCOM exporter already grouped them (same text = same
-- REPO record). The old text column is dropped by the next migration.
INSERT INTO "repositories" ("name")
  SELECT DISTINCT btrim("repository") FROM "sources" WHERE btrim(coalesce("repository", '')) <> '';--> statement-breakpoint
UPDATE "sources" SET "repository_id" = "repositories"."id"
  FROM "repositories" WHERE btrim("sources"."repository") = "repositories"."name";
