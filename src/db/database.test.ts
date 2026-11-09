import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { databaseOptions } from "./options";

describe("database connection policy", () => {
  it("keeps external TLS verified and disables prepared statements for the transaction pooler", () => {
    const c = databaseOptions(
      "postgresql://example:placeholder@db.example.com:6543/postgres?sslmode=disable",
    );
    expect(c.options.ssl).toEqual({ rejectUnauthorized: true });
    expect(c.url).not.toContain("sslmode");
    expect(c.options.prepare).toBe(false);
    expect(c.options.max).toBe(1);
    expect(databaseOptions("postgresql://localhost/test").options.ssl).toBe(
      false,
    );
  });
  it("rejects invalid credentials without including the supplied URL in errors", () => {
    expect(() => databaseOptions("not a valid URL")).toThrow(
      "데이터베이스 연결 주소 형식",
    );
    expect(() => databaseOptions("https://example.com")).toThrow(
      "PostgreSQL 연결 주소",
    );
  });
});
describe("PostgreSQL migrations and constraints (PGlite)", () => {
  let db: PGlite;
  let userId: string;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await migrate(drizzle(db), { migrationsFolder: "./drizzle" });
    const user = await db.query<{ id: string }>(
      "INSERT INTO app_private.users(login_id,password_hash,nickname) VALUES('tester','hash-fixture','연구원') RETURNING id",
    );
    userId = user.rows[0].id;
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  it("can apply the migration runner again without changing existing records", async () => {
    await migrate(drizzle(db), { migrationsFolder: "./drizzle" });
    expect(
      (await db.query("SELECT id FROM app_private.users")).rows,
    ).toHaveLength(1);
  });
  it("rejects duplicate IDs and requires email verification metadata together", async () => {
    await expect(
      db.exec(
        "INSERT INTO app_private.users(login_id,password_hash,nickname) VALUES('tester','hash-fixture','두번째')",
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      db.exec(
        "INSERT INTO app_private.users(login_id,password_hash,nickname,verified_email) VALUES('other','hash-fixture','다른 연구원','test@example.invalid')",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("blocks Data API roles and keeps RLS enabled on every private table", async () => {
    const rows = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private' AND c.relkind='r'",
    );
    expect(rows.rows).toHaveLength(9);
    expect(rows.rows.every((r) => r.relrowsecurity)).toBe(true);
    try {
      await db.exec("SET ROLE anon");
      await expect(
        db.exec("SELECT * FROM app_private.users"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("RESET ROLE");
    }
    // Even an accidental grant must not expose rows through Supabase's anonymous role.
    await db.exec(
      "GRANT USAGE ON SCHEMA app_private TO anon; GRANT SELECT ON app_private.users TO anon;",
    );
    try {
      await db.exec("SET ROLE anon");
      expect((await db.query("SELECT * FROM app_private.users")).rows).toEqual(
        [],
      );
    } finally {
      await db.exec(
        "RESET ROLE; REVOKE ALL ON SCHEMA app_private FROM anon; REVOKE ALL ON app_private.users FROM anon;",
      );
    }
  });
  it("prevents imported guest scores from becoming official records", async () => {
    await expect(
      db.query(
        "INSERT INTO app_private.attempts(id,user_id,game_id,mode,stage,rules_version,state,imported,payload) VALUES(gen_random_uuid(),$1,'pattern','official',1,'pattern-v1','result',true,'{}')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("gives each user one entry per event even if input class changes", async () => {
    const a = await db.query<{ id: string }>(
      "INSERT INTO app_private.attempts(id,user_id,game_id,mode,stage,rules_version,state,payload) VALUES(gen_random_uuid(),$1,'pattern','official',1,'pattern-v1','ready','{}'),(gen_random_uuid(),$1,'pattern','official',1,'pattern-v1','ready','{}') RETURNING id",
      [userId],
    );
    const e = await db.query<{ id: string }>(
      "INSERT INTO app_private.challenge_events(game_id,rules_version,bundle,opens_at,closes_at) VALUES('pattern','pattern-v1','{}',now(),now()+interval '1 day') RETURNING id",
    );
    await db.query(
      "INSERT INTO app_private.official_entries(user_id,event_id,attempt_id,input_class) VALUES($1,$2,$3,$4)",
      [userId, e.rows[0].id, a.rows[0].id, "mouse"],
    );
    await expect(
      db.query(
        "INSERT INTO app_private.official_entries(user_id,event_id,attempt_id,input_class) VALUES($1,$2,$3,$4)",
        [userId, e.rows[0].id, a.rows[1].id, "touch"],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("keeps game progress independent", async () => {
    await db.query(
      "INSERT INTO app_private.progress(user_id,game_id,completed_stages) VALUES($1,'pattern','[1,2]'),($1,'sequence','[1]')",
      [userId],
    );
    expect(
      (
        await db.query<{ game_id: string; completed_stages: number[] }>(
          "SELECT game_id,completed_stages FROM app_private.progress WHERE user_id=$1 ORDER BY game_id",
          [userId],
        )
      ).rows,
    ).toEqual([
      { game_id: "pattern", completed_stages: [1, 2] },
      { game_id: "sequence", completed_stages: [1] },
    ]);
  });
});
