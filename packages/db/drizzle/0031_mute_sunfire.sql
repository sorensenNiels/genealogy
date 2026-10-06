ALTER TABLE "album_metadata" ADD COLUMN "kind" text DEFAULT 'physical' NOT NULL;--> statement-breakpoint
ALTER TABLE "album_metadata" ADD COLUMN "cover" jsonb;--> statement-breakpoint
ALTER TABLE "album_metadata" ADD COLUMN "found" text;--> statement-breakpoint
ALTER TABLE "album_metadata" ADD COLUMN "scanned" text;--> statement-breakpoint
ALTER TABLE "album_metadata" ADD COLUMN "photos_per_page" integer DEFAULT 4 NOT NULL;