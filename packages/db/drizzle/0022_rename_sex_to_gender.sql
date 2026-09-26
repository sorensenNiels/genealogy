ALTER TYPE "public"."sex" RENAME TO "gender";--> statement-breakpoint
ALTER TABLE "persons" RENAME COLUMN "sex" TO "gender";
