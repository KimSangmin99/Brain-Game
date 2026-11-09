import type { Database } from "./database.ts";
// Compare actual catalogs with the same migrations applied to a clean PostgreSQL engine.
// A mismatch fails closed; adoption never alters application tables or data.
const checks = [
  `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private' AND c.relkind='r' ORDER BY c.relname`,
  `SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='app_private' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname`,
  `SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private' ORDER BY c.relname,k.conname`,
  `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='app_private' ORDER BY indexname`,
];
export async function verifyBaseline(actual: Database, expected: Database) {
  for (const sql of checks) {
    const a = await actual.query(sql),
      b = await expected.query(sql);
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(
        "기존 app_private 구조가 선택한 마이그레이션과 일치하지 않습니다. 적용 이력을 등록하지 않았습니다.",
      );
  }
  const permissions = await actual.query(
    `SELECT c.relname,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE n.nspname='app_private' AND c.relkind='r' AND r.rolname IN ('anon','authenticated') AND (has_table_privilege(r.oid,c.oid,'SELECT') OR has_table_privilege(r.oid,c.oid,'INSERT') OR has_table_privilege(r.oid,c.oid,'UPDATE') OR has_table_privilege(r.oid,c.oid,'DELETE'))`,
  );
  if (permissions.length)
    throw new Error(
      "Data API 역할의 앱 테이블 접근 권한을 먼저 회수해야 합니다.",
    );
}
export async function adoptBaseline(
  db: Database,
  migrations: { hash: string; folderMillis: number }[],
) {
  await db.transaction(async (tx) => {
    await tx.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY,hash text NOT NULL,created_at bigint)",
    );
    const previous = await tx.query(
      "SELECT id FROM drizzle.__drizzle_migrations",
    );
    if (previous.length)
      throw new Error(
        "기존 마이그레이션 이력이 있습니다. baseline 명령을 중단했습니다.",
      );
    for (const migration of migrations)
      await tx.query(
        "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
        [migration.hash, migration.folderMillis],
      );
  });
}
