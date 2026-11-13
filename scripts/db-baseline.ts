import nextEnv from "@next/env";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { databaseOptions } from "../src/db/options.ts";
import { verifyBaseline, adoptBaseline } from "../src/server/baseline.ts";
import type { Database } from "../src/server/database.ts";
nextEnv.loadEnvConfig(process.cwd());
const value = process.env.DIRECT_DATABASE_URL;
if (!value) {
  console.error("DIRECT_DATABASE_URL을 안전한 환경변수로 설정해야 합니다.");
  process.exit(1);
}
const { url, options } = databaseOptions(value, process.env.DATABASE_CA_CERT);
if (new URL(url).port === "6543") {
  console.error("직접 연결 또는 세션 풀러 주소가 필요합니다.");
  process.exit(1);
}
const through =
  process.argv.find((v) => v.startsWith("--through="))?.split("=")[1] ?? "0000";
if (!["0000", "0001", "0002"].includes(through)) {
  console.error(
    "--through=0000, --through=0001 또는 --through=0002를 사용하세요.",
  );
  process.exit(1);
}
const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" }).slice(
  0,
  Number(through) + 1,
);
const client = postgres(url, options),
  reference = new PGlite();
const expected: Database = {
  query: async <T extends Record<string, unknown>>(
    q: string,
    p: unknown[] = [],
  ) => (await reference.query<T>(q, p)).rows,
  transaction: async (run) => run(expected),
};
const adapt = (sql: postgres.Sql | postgres.TransactionSql): Database => ({
  query: async <T extends Record<string, unknown>>(
    q: string,
    p: unknown[] = [],
  ) => (await sql.unsafe(q, p as never[])) as unknown as T[],
  transaction: async (run) => run(adapt(sql)),
});
try {
  await reference.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const migration of migrations)
    for (const sql of migration.sql) await reference.exec(sql);
  // Validate and adopt under one transaction; serialize against another baseline runner.
  await client.begin(async (sql) => {
    const actual = adapt(sql);
    await actual.query("SELECT pg_advisory_xact_lock(71640301)");
    await verifyBaseline(actual, expected);
    await adoptBaseline(actual, migrations);
  });
  console.log(
    `기존 SQL 구조를 검증하고 ${through}까지의 마이그레이션 이력을 등록했습니다. 앱 데이터는 변경하지 않았습니다.`,
  );
} catch {
  console.error(
    "이력 등록을 중단했습니다. 대상 DB·기존 이력·스키마·권한을 확인하세요. 기존 데이터는 변경하지 않습니다.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
  await reference.close();
}
