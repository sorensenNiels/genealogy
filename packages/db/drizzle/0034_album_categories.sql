CREATE TABLE "album_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album_category_members" (
	"album_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "album_category_members_album_id_category_id_pk" PRIMARY KEY("album_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "album_category_members" ADD CONSTRAINT "album_category_members_album_id_album_metadata_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."album_metadata"("album_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_category_members" ADD CONSTRAINT "album_category_members_category_id_album_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."album_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "album_categories_name_lower_idx" ON "album_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "album_category_members_category_idx" ON "album_category_members" USING btree ("category_id");