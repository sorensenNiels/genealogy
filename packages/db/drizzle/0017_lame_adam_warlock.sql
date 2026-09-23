-- An event's free-text "description" becomes "notes" — same field, renamed
-- to match the markdown-editor convention every other notes field in this
-- app follows (persons.notes, unions.notes, person_names.notes). Two
-- ALTERs plus a data copy rather than a plain rename because drizzle-kit's
-- rename detection needs an interactive TTY prompt this environment doesn't
-- have; the effect is the same, just spelled out by hand.
ALTER TABLE "person_events" ADD COLUMN "notes" text;--> statement-breakpoint
UPDATE "person_events" SET "notes" = "description" WHERE "description" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "person_events" DROP COLUMN "description";
