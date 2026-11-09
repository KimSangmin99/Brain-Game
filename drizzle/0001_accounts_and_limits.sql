CREATE TABLE "app_private"."auth_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."auth_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_private"."users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "app_private"."users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "limits_expiry" ON "app_private"."auth_limits" USING btree ("expires_at");
--> statement-breakpoint
REVOKE ALL ON app_private.auth_limits FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app_private.auth_limits FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON app_private.auth_limits FROM authenticated; END IF;
END $$;
