CREATE TABLE "person_immich_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"immich_person_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_immich_links_immich_person_id_unique" UNIQUE("immich_person_id")
);
--> statement-breakpoint
ALTER TABLE "person_immich_links" ADD CONSTRAINT "person_immich_links_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_immich_links_person_idx" ON "person_immich_links" USING btree ("person_id");