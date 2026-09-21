ALTER TABLE "persons" ADD COLUMN "public_id" text;--> statement-breakpoint
-- Backfills existing rows before the column can become NOT NULL — new rows
-- get their id from generatePublicId() in the app itself (apps/backend/src/
-- person/public-id.ts), which this mirrors: one letter, six more
-- letters-or-digits, formatted XXXX-XXX. random() is re-evaluated per row,
-- so each existing person gets an independently random id; a same-row
-- collision across the handful of pre-existing rows is astronomically
-- unlikely (~56 billion combinations) and the UNIQUE constraint added below
-- would catch it regardless.
UPDATE "persons" SET "public_id" = (
  substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 26)::int + 1, 1) ||
  substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
  substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
  substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
  '-' ||
  substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
  substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
  substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1)
)
WHERE "public_id" IS NULL;--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_public_id_unique" UNIQUE("public_id");--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_public_id_format" CHECK ("public_id" ~ '^[A-Z][A-Z0-9]{3}-[A-Z0-9]{3}$');