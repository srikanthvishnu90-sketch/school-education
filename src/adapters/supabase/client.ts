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

// Postgres SQLSTATEs for "the object already exists" — the benign race when two
// processes apply the same idempotent migration concurrently (e.g. parallel test
// files). CREATE ... IF NOT EXISTS is not race-safe on the catalog unique index.
const TRANSIENT_DDL = new Set([
  "42P06", // duplicate_schema
  "42710", // duplicate_object (role, policy)
  "42P07", // duplicate_table
  "23505", // unique_violation (pg_namespace / pg_class)
  "42723", // duplicate_function
]);

/**
 * Runs an idempotent migration step, retrying briefly on a concurrent-DDL race.
 * On retry the "if not exists" guards see the object already present and pass.
 */
export async function runIdempotent(
  step: () => Promise<void>,
  attempts = 6,
): Promise<void> {
  for (let i = 0; ; i += 1) {
    try {
      await step();
      return;
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (i >= attempts - 1 || !TRANSIENT_DDL.has(code)) throw err;
      await new Promise((resolve) =>
        setTimeout(resolve, 15 + Math.floor(Math.random() * 50)),
      );
    }
  }
}
