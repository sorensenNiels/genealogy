ALTER TABLE "person_names" ALTER COLUMN "name_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."name_variant_type";--> statement-breakpoint
CREATE TYPE "public"."name_variant_type" AS ENUM('birth', 'married', 'nickname', 'alternate_spelling', 'other');--> statement-breakpoint
ALTER TABLE "person_names" ALTER COLUMN "name_type" SET DATA TYPE "public"."name_variant_type" USING "name_type"::"public"."name_variant_type";--> statement-breakpoint
INSERT INTO "person_names" ("person_id", "name_type", "given", "surname")
SELECT "persons"."id", 'nickname', "nick", ''
FROM "persons", unnest("persons"."nickname") AS "nick"
WHERE array_length("persons"."nickname", 1) > 0;--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "nickname";
