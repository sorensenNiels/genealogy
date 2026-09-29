CREATE TABLE "immich_album_asset_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "immich_album_asset_order_album_asset_idx" ON "immich_album_asset_order" USING btree ("album_id","asset_id");--> statement-breakpoint
CREATE INDEX "immich_album_asset_order_album_idx" ON "immich_album_asset_order" USING btree ("album_id","position");