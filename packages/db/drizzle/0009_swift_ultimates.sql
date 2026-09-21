-- Postgres can't cast text -> text[] automatically; USING turns any existing
-- single nickname into a one-element array, and a NULL into an empty array.
ALTER TABLE "persons" ALTER COLUMN "nickname" SET DATA TYPE text[] USING (
  CASE WHEN "nickname" IS NULL THEN '{}'::text[] ELSE ARRAY["nickname"] END
);--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "nickname" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "nickname" SET NOT NULL;