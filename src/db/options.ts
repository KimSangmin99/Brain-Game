import type { Options } from "postgres";

export function databaseOptions(
  connectionString: string,
  ca?: string,
): { url: string; options: Options<Record<string, never>> } {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("데이터베이스 연결 주소 형식을 확인해 주세요.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("PostgreSQL 연결 주소가 필요합니다.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // URL ssl options must not silently downgrade certificate verification.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  return {
    url: url.toString(),
    options: {
      prepare: false,
      max: 1,
      connect_timeout: 10,
      idle_timeout: 20,
      max_lifetime: 900,
      ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    },
  };
}
