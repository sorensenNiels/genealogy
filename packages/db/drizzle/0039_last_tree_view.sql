ALTER TABLE "user_profiles" ADD COLUMN "last_tree_person_id" uuid;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "last_tree_view" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "last_tree_orientation" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_last_tree_person_id_persons_id_fk" FOREIGN KEY ("last_tree_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;