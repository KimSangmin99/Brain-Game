import "server-only";
import type { TransactionSql, Sql } from "postgres";
import { getSqlClient } from "../db/client";
import type { Database } from "./database";
function adapter(sql: Sql | TransactionSql): Database {
  return {
    async query<T extends Record<string, unknown>>(
      query: string,
      params: unknown[] = [],
    ) {
      return (await sql.unsafe(query, params as never[])) as unknown as T[];
    },
    async transaction<T>(run: (tx: Database) => Promise<T>) {
      if ("begin" in sql)
        return (await (sql as Sql).begin((tx) => run(adapter(tx)))) as T;
      return run(adapter(sql));
    },
  };
}
export const productionDatabase = () => adapter(getSqlClient());
