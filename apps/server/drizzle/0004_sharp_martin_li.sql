CREATE TYPE "public"."timer_status" AS ENUM('running', 'paused');--> statement-breakpoint
CREATE TABLE "active_timer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" timer_status NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"total_accumulated_duration" integer DEFAULT 0 NOT NULL,
	"last_interval_start_time" timestamp with time zone,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "active_timer_sessions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "active_timer_sessions" ADD CONSTRAINT "active_timer_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;