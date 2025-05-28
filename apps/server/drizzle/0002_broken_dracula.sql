ALTER TABLE "time_entries" ADD COLUMN "date" date NOT NULL DEFAULT CURRENT_DATE;--> statement-breakpoint
UPDATE "time_entries" SET "date" = DATE("start_time");--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "start_time";--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "end_time";

