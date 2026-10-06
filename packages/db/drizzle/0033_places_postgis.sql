-- PostGIS is created here rather than assumed: postgres/01-init-age.sql only
-- runs on a fresh data volume, so a database initialized before PostGIS was
-- added to the image never got it. Needs the postgresql-18-postgis-3 package
-- on the server (postgres/Dockerfile) — on an older image this migration
-- fails, and only this one, since it's deliberately last.
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" geometry(point, 4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "places_location_idx" ON "places" USING gist ("location");