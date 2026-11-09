// Small SQL boundary shared by PostgreSQL and the integration-test adapter.
export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  transaction<T>(run: (tx: Database) => Promise<T>): Promise<T>;
}
