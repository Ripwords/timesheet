CREATE TYPE "public"."department" AS ENUM('frontend_design', 'frontend_js', 'backend', 'uiux', 'digital_marketing');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department" "department" NOT NULL;