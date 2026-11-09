import nextEnv from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { databaseOptions } from "../src/db/options.ts";

nextEnv.loadEnvConfig(process.cwd());
const value = process.env.DIRECT_DATABASE_URL;
if (!value) {
  console.error("DIRECT_DATABASE_URL을 안전한 환경변수로 설정해야 합니다.");
  process.exit(1);
}
const { url, options } = databaseOptions(value, process.env.DATABASE_CA_CERT);
if (new URL(url).port === "6543") {
  console.error("마이그레이션에는 직접 연결 또는 세션 풀러 주소를 사용하세요.");
  process.exit(1);
}
const client = postgres(url, options);
try {
  const [state] = await client.unsafe(
    "SELECT to_regclass('app_private.users') AS users,to_regclass('drizzle.__drizzle_migrations') AS ledger",
  );
  if (state.users && !state.ledger) {
    throw new Error("MANUAL_SCHEMA_NEEDS_BASELINE");
  }
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("데이터베이스 마이그레이션이 완료됐습니다.");
} catch (error) {
  if (
    error instanceof Error &&
    error.message === "MANUAL_SCHEMA_NEEDS_BASELINE"
  ) {
    console.error(
      "수동 SQL로 생성한 DB입니다. 스키마 확인 후 npm run db:baseline으로 이력을 등록하세요.",
    );
  } else
    console.error(
      "마이그레이션 실패: 연결·권한·TLS 설정을 확인하세요. 연결 문자열은 출력하지 않습니다.",
    );
  process.exitCode = 1;
} finally {
  await client.end();
}
