CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"person_id" uuid,
	"phone_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "persons_single_root_idx";--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_person_id_idx" ON "user_profiles" USING btree ("person_id") WHERE "user_profiles"."person_id" is not null;--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "is_root_person";