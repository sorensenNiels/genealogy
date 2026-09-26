CREATE TABLE "research_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"note_type" text NOT NULL,
	"body" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_notes_person_idx" ON "research_notes" USING btree ("person_id");--> statement-breakpoint
INSERT INTO "configurable_options" ("topic", "key", "label", "sort_order", "is_protected") VALUES
('research_note_type', 'open_question', 'Open question', 0, true),
('research_note_type', 'note', 'Note', 1, true);