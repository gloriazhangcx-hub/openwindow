CREATE TABLE "manual_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" varchar(240) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "time_zone" varchar(100) NOT NULL,
  "location" varchar(240) DEFAULT '' NOT NULL,
  "event_url" varchar(2000) DEFAULT '' NOT NULL,
  "topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "formats" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "attendance_status" varchar(32) DEFAULT 'interested' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "manual_events_end_after_start_check" CHECK ("manual_events"."ends_at" > "manual_events"."starts_at"),
  CONSTRAINT "manual_events_attendance_status_check" CHECK ("manual_events"."attendance_status" in ('interested', 'planning_to_attend', 'registered'))
);
--> statement-breakpoint
ALTER TABLE "manual_events" ADD CONSTRAINT "manual_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "manual_events_user_start_idx" ON "manual_events" USING btree ("user_id", "starts_at");
