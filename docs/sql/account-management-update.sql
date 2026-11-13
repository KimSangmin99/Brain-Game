-- 기존 0000·0001 적용 후 한 번 실행합니다. 기존 데이터는 변경하지 않습니다.
BEGIN;
CREATE TABLE "app_private"."account_deletions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"login_id_hash" text NOT NULL,
	"receipt_hash" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_private"."account_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "deleted_login_unique" ON "app_private"."account_deletions" USING btree ("login_id_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_receipt_unique" ON "app_private"."account_deletions" USING btree ("receipt_hash");
--> statement-breakpoint
REVOKE ALL ON app_private.account_deletions FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=target_role) THEN
      EXECUTE format('REVOKE ALL ON app_private.account_deletions FROM %I',target_role);
    END IF;
  END LOOP;
END $$;

COMMIT;
