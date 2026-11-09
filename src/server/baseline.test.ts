import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { pgliteAdapter } from "../test/database";
import { verifyBaseline, adoptBaseline } from "./baseline";
it("adopts manually applied initial SQL without replaying CREATE TABLE, then migrates forward", async () => {
  const actual = new PGlite(),
    reference = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
    for (const db of [actual, reference]) {
      await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
      for (const sql of migrations[0].sql) await db.exec(sql);
    }
    const db = pgliteAdapter(actual),
      expected = pgliteAdapter(reference);
    await db.query(
      "INSERT INTO app_private.users(login_id,password_hash,nickname) VALUES('fixture','hash','연구원')",
    );
    await verifyBaseline(db, expected);
    await adoptBaseline(db, [migrations[0]]);
    await migrate(drizzle(actual), { migrationsFolder: "./drizzle" });
    expect(
      (await db.query("SELECT login_id FROM app_private.users"))[0].login_id,
    ).toBe("fixture");
    expect(
      await db.query("SELECT * FROM drizzle.__drizzle_migrations"),
    ).toHaveLength(2);
    await expect(adoptBaseline(db, [migrations[0]])).rejects.toThrow(
      "기존 마이그레이션 이력",
    );
  } finally {
    await actual.close();
    await reference.close();
  }
}, 30000);
it("refuses adoption when constraints or API permissions differ", async () => {
  const actual = new PGlite(),
    reference = new PGlite();
  try {
    const migration = readMigrationFiles({ migrationsFolder: "./drizzle" })[0];
    for (const db of [actual, reference]) {
      await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
      for (const sql of migration.sql) await db.exec(sql);
    }
    const db = pgliteAdapter(actual),
      expected = pgliteAdapter(reference);
    await actual.exec("GRANT SELECT ON app_private.users TO anon");
    await expect(verifyBaseline(db, expected)).rejects.toThrow("Data API");
    await actual.exec(
      "REVOKE ALL ON app_private.users FROM anon; ALTER TABLE app_private.users DROP CONSTRAINT login_format;",
    );
    await expect(verifyBaseline(db, expected)).rejects.toThrow("일치하지");
    expect(
      (
        await actual.query<{ ledger: string | null }>(
          "SELECT to_regclass('drizzle.__drizzle_migrations') AS ledger",
        )
      ).rows[0].ledger,
    ).toBeNull();
  } finally {
    await actual.close();
    await reference.close();
  }
}, 30000);
