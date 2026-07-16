import { describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "@/adapters/supabase";
import type { SqlClient } from "@/adapters/supabase";

/**
 * A fake Postgres that models only what the migration runner touches: the
 * schema_migrations ledger (select + insert) and DDL statements (recorded, never
 * parsed). Enough to prove once-only application, ordering, drift detection, and
 * the concurrent insert-if-absent path — without a live database.
 */
function fakeDb(): { client: SqlClient; ddl: string[]; ledgerIds: () => string[] } {
  const ledger = new Map<string, string>(); // id -> checksum
  const ddl: string[] = [];
  const client: SqlClient = {
    async query<R extends Record<string, unknown>>(
      text: string,
      params?: readonly unknown[],
    ): Promise<{ rows: R[] }> {
      const sql = text.trim();
      if (sql.startsWith("select id, checksum")) {
        return {
          rows: [...ledger].map(([id, checksum]) => ({ id, checksum })) as unknown as R[],
        };
      }
      if (sql.startsWith("insert into public.schema_migrations")) {
        const [id, checksum] = params as [string, string];
        if (!ledger.has(id)) ledger.set(id, checksum);
        return { rows: [] };
      }
      // Any other statement is DDL (the ledger table create, or a migration body).
      if (!sql.startsWith("create table if not exists public.schema_migrations")) {
        ddl.push(sql);
      }
      return { rows: [] };
    },
  };
  return { client, ddl, ledgerIds: () => [...ledger.keys()] };
}

const M1: Migration = { id: "0001_a", sql: "create table a();" };
const M2: Migration = { id: "0002_b", sql: "create table b();" };

describe("applyMigrations", () => {
  it("applies pending migrations once, in order, and records them", async () => {
    const db = fakeDb();
    const first = await applyMigrations(db.client, [M1, M2]);
    expect(first.applied).toEqual(["0001_a", "0002_b"]);
    expect(db.ddl).toEqual(["create table a();", "create table b();"]);
    expect(db.ledgerIds()).toEqual(["0001_a", "0002_b"]);
  });

  it("is a no-op on the second boot — nothing re-runs", async () => {
    const db = fakeDb();
    await applyMigrations(db.client, [M1, M2]);
    db.ddl.length = 0;
    const second = await applyMigrations(db.client, [M1, M2]);
    expect(second.applied).toEqual([]);
    expect(db.ddl).toEqual([]);
  });

  it("applies only the newly-added migration when the set grows", async () => {
    const db = fakeDb();
    await applyMigrations(db.client, [M1]);
    db.ddl.length = 0;
    const grown = await applyMigrations(db.client, [M1, M2]);
    expect(grown.applied).toEqual(["0002_b"]);
    expect(db.ddl).toEqual(["create table b();"]);
  });

  it("throws if an already-applied migration's SQL was edited (drift)", async () => {
    const db = fakeDb();
    await applyMigrations(db.client, [M1]);
    const edited: Migration = { id: "0001_a", sql: "create table a(x int);" };
    await expect(applyMigrations(db.client, [edited])).rejects.toThrow(/different checksum/);
  });
});
