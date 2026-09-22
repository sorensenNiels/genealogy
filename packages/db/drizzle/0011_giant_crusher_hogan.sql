ALTER TABLE "person_names" ALTER COLUMN "name_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."name_variant_type";--> statement-breakpoint
CREATE TYPE "public"."name_variant_type" AS ENUM('birth', 'married', 'alternate_spelling', 'other');--> statement-breakpoint
ALTER TABLE "person_names" ALTER COLUMN "name_type" SET DATA TYPE "public"."name_variant_type" USING "name_type"::"public"."name_variant_type";--> statement-breakpoint
ALTER TABLE "person_names" ADD COLUMN "since" jsonb;