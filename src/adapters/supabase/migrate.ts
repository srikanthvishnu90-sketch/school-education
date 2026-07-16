import { createHash } from "node:crypto";
import { runIdempotent, type SqlClient } from "./client";

/**
 * The versioned migration runner. Instead of re-running giant
 * `create ... if not exists` blobs on every boot, each schema change is a NUMBERED
 * migration recorded in a `public.schema_migrations` ledger: it applies exactly
 * once, in order, and leaves an auditable record of what ran and when.
 *
 * Two invariants make this safe as the product ships to real districts:
 *   · once-only — an id already in the ledger is skipped, so boots are cheap and
 *     a migration never half-re-applies.
 *   · immutable — a shipped migration's SQL is fingerprinted; if the recorded
 *     checksum ever stops matching the source, the runner THROWS rather than
 *     silently diverging. You add a new migration; you never edit an applied one.
 *
 * Concurrent boots (serverless, parallel test files) race safely: the ledger
 * write is insert-if-absent and every DDL step runs under `runIdempotent`.
 */

export interface Migration {
  /** Zero-padded, ordered, DOMAIN-prefixed id — e.g. "0001_core_schema". */
  id: string;
  sql: string;
}

const LEDGER_DDL = `
create table if not exists public.schema_migrations (
  id text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export async function applyMigrations(
  client: SqlClient,
  migrations: readonly Migration[],
): Promise<{ applied: string[] }> {
  await runIdempotent(async () => {
    await client.query(LEDGER_DDL);
  });

  const { rows } = await client.query<{ id: string; checksum: string }>(
    "select id, checksum from public.schema_migrations",
  );
  const recorded = new Map(rows.map((r) => [r.id, r.checksum]));

  const applied: string[] = [];
  for (const m of migrations) {
    const sum = checksum(m.sql);
    const prior = recorded.get(m.id);
    if (prior !== undefined) {
      if (prior !== sum) {
        throw new Error(
          `Migration ${m.id} was already applied with a different checksum. ` +
            `Shipped migrations are immutable — add a new migration instead of editing this one.`,
        );
      }
      continue;
    }
    await runIdempotent(async () => {
      await client.query(m.sql);
    });
    await client.query(
      `insert into public.schema_migrations (id, checksum) values ($1, $2)
       on conflict (id) do nothing`,
      [m.id, sum],
    );
    applied.push(m.id);
  }
  return { applied };
}
