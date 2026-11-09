import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../server/database";
export function pgliteAdapter(
  engine: Pick<PGlite, "query" | "transaction">,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      q: string,
      p: unknown[] = [],
    ) => (await engine.query<T>(q, p)).rows,
    transaction: (run) =>
      engine.transaction((tx) => run(pgliteAdapter(tx as unknown as PGlite))),
  };
}
export async function testDatabase() {
  const engine = new PGlite();
  await engine.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await migrate(drizzle(engine), { migrationsFolder: "./drizzle" });
  return { engine, db: pgliteAdapter(engine) };
}
