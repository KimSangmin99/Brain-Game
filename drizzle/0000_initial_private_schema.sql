CREATE SCHEMA "app_private";
--> statement-breakpoint
CREATE TABLE "app_private"."action_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"target_email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "token_purpose" CHECK ("app_private"."action_tokens"."purpose" in ('verify_email','reset_password'))
);
--> statement-breakpoint
ALTER TABLE "app_private"."action_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"mode" text NOT NULL,
	"stage" integer NOT NULL,
	"rules_version" text NOT NULL,
	"state" text NOT NULL,
	"score" integer,
	"assisted" boolean DEFAULT false NOT NULL,
	"interrupted" boolean DEFAULT false NOT NULL,
	"imported" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_game" CHECK ("app_private"."attempts"."game_id" in ('pattern','sequence','rule','code','arrangement','route','search','switch')),
	CONSTRAINT "attempt_mode" CHECK ("app_private"."attempts"."mode" in ('stage','practice','official')),
	CONSTRAINT "attempt_stage" CHECK ("app_private"."attempts"."stage" between 1 and 30),
	CONSTRAINT "attempt_score" CHECK ("app_private"."attempts"."score" is null or "app_private"."attempts"."score" between 0 and 10000),
	CONSTRAINT "attempt_revision" CHECK ("app_private"."attempts"."revision" >= 0),
	CONSTRAINT "import_not_official" CHECK (not ("app_private"."attempts"."imported" and "app_private"."attempts"."mode" = 'official'))
);
--> statement-breakpoint
ALTER TABLE "app_private"."attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "session_expiry" CHECK ("app_private"."auth_sessions"."idle_expires_at" <= "app_private"."auth_sessions"."absolute_expires_at")
);
--> statement-breakpoint
ALTER TABLE "app_private"."auth_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."challenge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" text NOT NULL,
	"rules_version" text NOT NULL,
	"bundle" jsonb NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "event_period" CHECK ("app_private"."challenge_events"."opens_at" < "app_private"."challenge_events"."closes_at"),
	CONSTRAINT "event_status" CHECK ("app_private"."challenge_events"."status" in ('draft','open','closed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "app_private"."challenge_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_state" CHECK ("app_private"."email_outbox"."state" in ('pending','processing','sent','failed'))
);
--> statement-breakpoint
ALTER TABLE "app_private"."email_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."merge_receipts" (
	"guest_profile_id" uuid NOT NULL,
	"source_attempt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merge_receipts_guest_profile_id_source_attempt_id_pk" PRIMARY KEY("guest_profile_id","source_attempt_id")
);
--> statement-breakpoint
ALTER TABLE "app_private"."merge_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."official_entries" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"input_class" text NOT NULL,
	CONSTRAINT "official_entries_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "app_private"."official_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."progress" (
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"completed_stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_user_id_game_id_pk" PRIMARY KEY("user_id","game_id"),
	CONSTRAINT "progress_array" CHECK (jsonb_typeof("app_private"."progress"."completed_stages") = 'array')
);
--> statement-breakpoint
ALTER TABLE "app_private"."progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_private"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"nickname" text NOT NULL,
	"public_tag" uuid DEFAULT gen_random_uuid() NOT NULL,
	"verified_email" text,
	"email_verified_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"profile_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_format" CHECK ("app_private"."users"."login_id" ~ '^[a-z0-9_]{4,20}$'),
	CONSTRAINT "user_status" CHECK ("app_private"."users"."status" in ('active','deleting','disabled')),
	CONSTRAINT "email_verified_together" CHECK (("app_private"."users"."verified_email" is null) = ("app_private"."users"."email_verified_at" is null))
);
--> statement-breakpoint
ALTER TABLE "app_private"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."action_tokens" ADD CONSTRAINT "action_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_private"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_private"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_private"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_private"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."merge_receipts" ADD CONSTRAINT "merge_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_private"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."merge_receipts" ADD CONSTRAINT "merge_receipts_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "app_private"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."official_entries" ADD CONSTRAINT "official_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_private"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."official_entries" ADD CONSTRAINT "official_entries_event_id_challenge_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app_private"."challenge_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."official_entries" ADD CONSTRAINT "official_entries_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "app_private"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_private"."progress" ADD CONSTRAINT "progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_private"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_user_purpose" ON "app_private"."action_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "attempts_user_game" ON "app_private"."attempts" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "app_private"."auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_pending" ON "app_private"."email_outbox" USING btree ("state","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_attempt_unique" ON "app_private"."official_entries" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_login_unique" ON "app_private"."users" USING btree ("login_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "app_private"."users" USING btree ("verified_email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tag_unique" ON "app_private"."users" USING btree ("public_tag");
--> statement-breakpoint
REVOKE ALL ON SCHEMA "app_private" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA "app_private" FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app_private FROM %I', target_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM %I', target_role);
    END IF;
  END LOOP;
END $$;
