import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { databaseOptions } from "./options";

let cached: ReturnType<typeof createDatabase> | undefined;
function createDatabase() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("서버 데이터베이스가 아직 설정되지 않았습니다.");
  const { url, options } = databaseOptions(value, process.env.DATABASE_CA_CERT);
  const client = postgres(url, options);
  return { db: drizzle(client, { schema }), client };
}
// Lazy initialization: guest pages and builds need no database credential.
export function getDatabase() {
  return (cached ??= createDatabase()).db;
}
