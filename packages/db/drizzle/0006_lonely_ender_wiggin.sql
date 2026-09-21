CREATE TYPE "public"."citation_fact_type" AS ENUM('person', 'birth', 'death', 'name', 'event', 'union');--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "fact_type" "citation_fact_type" DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "fact_id" uuid;--> statement-breakpoint
CREATE INDEX "citations_fact_idx" ON "citations" USING btree ("fact_type","fact_id");