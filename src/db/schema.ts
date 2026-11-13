import { sql } from "drizzle-orm";
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";

// Not an exposed Supabase Data API schema. Only the trusted Next.js server connects.
export const privateSchema = pgSchema("app_private");
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const users = privateSchema
  .table(
    "users",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      loginId: text("login_id").notNull(),
      passwordHash: text("password_hash").notNull(),
      nickname: text("nickname").notNull(),
      publicTag: uuid("public_tag").notNull().defaultRandom(),
      verifiedEmail: text("verified_email"),
      emailVerifiedAt: time("email_verified_at"),
      status: text("status").notNull().default("active"),
      profileVersion: integer("profile_version").notNull().default(1),
      termsVersion: text("terms_version"),
      termsAcceptedAt: time("terms_accepted_at"),
      createdAt: time("created_at").notNull().defaultNow(),
    },
    (t) => [
      uniqueIndex("users_login_unique").on(t.loginId),
      uniqueIndex("users_email_unique").on(t.verifiedEmail),
      uniqueIndex("users_tag_unique").on(t.publicTag),
      check("login_format", sql`${t.loginId} ~ '^[a-z0-9_]{4,20}$'`),
      check(
        "user_status",
        sql`${t.status} in ('active','deleting','disabled')`,
      ),
      check(
        "email_verified_together",
        sql`(${t.verifiedEmail} is null) = (${t.emailVerifiedAt} is null)`,
      ),
    ],
  )
  .enableRLS();
export const authSessions = privateSchema
  .table(
    "auth_sessions",
    {
      tokenHash: text("token_hash").primaryKey(),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      createdAt: time("created_at").notNull().defaultNow(),
      idleExpiresAt: time("idle_expires_at").notNull(),
      absoluteExpiresAt: time("absolute_expires_at").notNull(),
      revokedAt: time("revoked_at"),
    },
    (t) => [
      index("sessions_user").on(t.userId),
      check(
        "session_expiry",
        sql`${t.idleExpiresAt} <= ${t.absoluteExpiresAt}`,
      ),
    ],
  )
  .enableRLS();
export const actionTokens = privateSchema
  .table(
    "action_tokens",
    {
      tokenHash: text("token_hash").primaryKey(),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      purpose: text("purpose").notNull(),
      targetEmail: text("target_email"),
      expiresAt: time("expires_at").notNull(),
      consumedAt: time("consumed_at"),
    },
    (t) => [
      index("tokens_user_purpose").on(t.userId, t.purpose),
      check(
        "token_purpose",
        sql`${t.purpose} in ('verify_email','reset_password')`,
      ),
    ],
  )
  .enableRLS();
export const attempts = privateSchema
  .table(
    "attempts",
    {
      id: uuid("id").primaryKey(),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      gameId: text("game_id").notNull(),
      mode: text("mode").notNull(),
      stage: integer("stage").notNull(),
      rulesVersion: text("rules_version").notNull(),
      state: text("state").notNull(),
      score: integer("score"),
      assisted: boolean("assisted").notNull().default(false),
      interrupted: boolean("interrupted").notNull().default(false),
      imported: boolean("imported").notNull().default(false),
      payload: jsonb("payload").notNull(),
      revision: integer("revision").notNull().default(0),
      createdAt: time("created_at").notNull().defaultNow(),
      updatedAt: time("updated_at").notNull().defaultNow(),
    },
    (t) => [
      index("attempts_user_game").on(t.userId, t.gameId),
      check(
        "attempt_game",
        sql`${t.gameId} in ('pattern','sequence','rule','code','arrangement','route','search','switch')`,
      ),
      check("attempt_mode", sql`${t.mode} in ('stage','practice','official')`),
      check("attempt_stage", sql`${t.stage} between 1 and 30`),
      check(
        "attempt_score",
        sql`${t.score} is null or ${t.score} between 0 and 10000`,
      ),
      check("attempt_revision", sql`${t.revision} >= 0`),
      check(
        "import_not_official",
        sql`not (${t.imported} and ${t.mode} = 'official')`,
      ),
    ],
  )
  .enableRLS();
export const progress = privateSchema
  .table(
    "progress",
    {
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      gameId: text("game_id").notNull(),
      completedStages: jsonb("completed_stages").notNull().default([]),
      revision: integer("revision").notNull().default(0),
      updatedAt: time("updated_at").notNull().defaultNow(),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.gameId] }),
      check(
        "progress_array",
        sql`jsonb_typeof(${t.completedStages}) = 'array'`,
      ),
    ],
  )
  .enableRLS();
export const mergeReceipts = privateSchema
  .table(
    "merge_receipts",
    {
      guestProfileId: uuid("guest_profile_id").notNull(),
      sourceAttemptId: uuid("source_attempt_id").notNull(),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      attemptId: uuid("attempt_id")
        .notNull()
        .references(() => attempts.id, { onDelete: "cascade" }),
      createdAt: time("created_at").notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.guestProfileId, t.sourceAttemptId] })],
  )
  .enableRLS();
export const challengeEvents = privateSchema
  .table(
    "challenge_events",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      gameId: text("game_id").notNull(),
      rulesVersion: text("rules_version").notNull(),
      bundle: jsonb("bundle").notNull(),
      opensAt: time("opens_at").notNull(),
      closesAt: time("closes_at").notNull(),
      status: text("status").notNull().default("draft"),
    },
    (t) => [
      check("event_period", sql`${t.opensAt} < ${t.closesAt}`),
      check(
        "event_status",
        sql`${t.status} in ('draft','open','closed','cancelled')`,
      ),
    ],
  )
  .enableRLS();
export const officialEntries = privateSchema
  .table(
    "official_entries",
    {
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      eventId: uuid("event_id")
        .notNull()
        .references(() => challengeEvents.id),
      attemptId: uuid("attempt_id")
        .notNull()
        .references(() => attempts.id),
      inputClass: text("input_class").notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.eventId] }),
      uniqueIndex("entry_attempt_unique").on(t.attemptId),
    ],
  )
  .enableRLS();
export const emailOutbox = privateSchema
  .table(
    "email_outbox",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      userId: uuid("user_id").references(() => users.id, {
        onDelete: "cascade",
      }),
      purpose: text("purpose").notNull(),
      encryptedPayload: text("encrypted_payload").notNull(),
      state: text("state").notNull().default("pending"),
      attemptCount: integer("attempt_count").notNull().default(0),
      availableAt: time("available_at").notNull().defaultNow(),
      expiresAt: time("expires_at").notNull(),
      leaseUntil: time("lease_until"),
      createdAt: time("created_at").notNull().defaultNow(),
    },
    (t) => [
      index("outbox_pending").on(t.state, t.availableAt),
      check(
        "outbox_state",
        sql`${t.state} in ('pending','processing','sent','failed')`,
      ),
    ],
  )
  .enableRLS();

export const authLimits = privateSchema
  .table(
    "auth_limits",
    {
      key: text("key").primaryKey(),
      count: integer("count").notNull(),
      expiresAt: time("expires_at").notNull(),
    },
    (t) => [index("limits_expiry").on(t.expiresAt)],
  )
  .enableRLS();

// Minimal deletion ledger survives removal of the user and their cascading data.
export const accountDeletions = privateSchema
  .table(
    "account_deletions",
    {
      userId: uuid("user_id").primaryKey(),
      loginIdHash: text("login_id_hash").notNull(),
      receiptHash: text("receipt_hash").notNull(),
      deletedAt: time("deleted_at").notNull().defaultNow(),
    },
    (t) => [
      uniqueIndex("deleted_login_unique").on(t.loginIdHash),
      uniqueIndex("deletion_receipt_unique").on(t.receiptHash),
    ],
  )
  .enableRLS();
