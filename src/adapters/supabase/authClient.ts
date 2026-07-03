import { Client } from "pg";
import type { SqlClient } from "./client";

/**
 * A SqlClient that runs as the non-superuser `authenticated` role with a fixed
 * set of JWT claims — so ROW-LEVEL SECURITY applies to everything it does. This
 * is how a signed-in user reaches the database: the app never trusts itself to
 * filter rows; the policies do. One dedicated connection carries the role and
 * claims for its lifetime.
 */
export interface AuthClaims {
  /** The user's id (student/teacher/admin id). */
  sub: string;
  /** The application role. */
  user_role: "student" | "teacher" | "school_admin" | "counselor";
  /** The school tenant. */
  tenant_id: string;
}

export interface AuthenticatedClient extends SqlClient {
  end(): Promise<void>;
}

export async function createAuthenticatedClient(
  connectionString: string,
  claims: AuthClaims,
): Promise<AuthenticatedClient> {
  const client = new Client({ connectionString });
  await client.connect();
  // Drop to the application role and pin the claims for this connection. RLS now
  // governs every query; a superuser connection would bypass it (service role).
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify(claims),
  ]);
  return {
    async query(text, params) {
      const result = await client.query(text, params as unknown[]);
      return { rows: result.rows };
    },
    async end() {
      await client.end();
    },
  };
}
