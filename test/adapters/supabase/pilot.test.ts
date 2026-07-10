import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPgClient,
  createPgPilotEventRepository,
  createPgPseudonymRepository,
  runMigrations,
  type PoolClient,
} from "@/adapters/supabase";
import { createSequentialClock } from "@/adapters/memory";

/**
 * Pilot metadata (P17) is now PG-backed, so it survives restarts under Postgres.
 * Gated on TEST_DATABASE_URL. Round-trips each adapter through the real database.
 * Idempotent inserts (unique keys per test), no truncation — coexists with the
 * other gated suites.
 */
const DB = process.env.TEST_DATABASE_URL;
const suite = DB ? describe : describe.skip;

suite("pilot PG adapters", () => {
  let client: PoolClient;
  const clock = createSequentialClock(Date.UTC(2026, 6, 3));

  beforeAll(async () => {
    client = createPgClient(DB as string);
    await runMigrations(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("pilot events append and list back (pseudonymized payloads)", async () => {
    const repo = createPgPilotEventRepository(client, clock);
    await repo.append({
      studentId: "pseud-abc",
      tenantId: "pilot-tenant-x",
      type: "cycle_completed",
      elapsedInCycleMs: 120_000,
      cycleN: 1,
      at: new Date("2026-07-01T00:00:00Z"),
    });
    const forTenant = await repo.listByTenant("pilot-tenant-x");
    expect(forTenant.some((e) => e.studentId === "pseud-abc")).toBe(true);
    expect(forTenant.every((e) => e.at instanceof Date)).toBe(true);
  });

  it("pseudonyms are stable across calls (mint once)", async () => {
    const repo = createPgPseudonymRepository(client, clock);
    const first = await repo.resolve("real-student-77");
    const second = await repo.resolve("real-student-77");
    expect(first).toBe(second);
    expect(first).not.toContain("real-student-77");
  });
});
