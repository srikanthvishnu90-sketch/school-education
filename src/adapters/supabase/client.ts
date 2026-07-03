import { Pool } from "pg";

/**
 * The narrow SQL surface the Postgres adapters depend on — constructor-injected,
 * so the same adapters run against Supabase's Postgres (via `pg`) in production
 * and against a local Postgres in the contract tests. Nothing outside
 * src/adapters/supabase imports `pg` or this client.
 */
export interface SqlClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
}

export interface PoolClient extends SqlClient {
  end(): Promise<void>;
}

/** A `pg.Pool`-backed client for a Supabase (or any) Postgres connection string. */
export function createPgClient(connectionString: string): PoolClient {
  const pool = new Pool({ connectionString });
  return {
    async query(text, params) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: result.rows };
    },
    end: () => pool.end(),
  };
}

/** The default tenant every row is stamped with until P12 introduces real tenancy. */
export const DEFAULT_TENANT_ID = "tenant-default";
