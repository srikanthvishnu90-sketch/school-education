import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyRls,
  createPgClient,
  runMigrations,
  type PoolClient,
} from "@/adapters/supabase";
import { createPgCrisisEscalationRepository, type CrisisEscalation } from "@/safety";

/**
 * Crisis escalations (P16) are now PG-backed, so escalations and their
 * unacknowledged-retry state survive restarts. Gated on TEST_DATABASE_URL. The row
 * is written as explicit columns — the same shape the RLS counselor policy reads.
 */
const DB = process.env.TEST_DATABASE_URL;
const suite = DB ? describe : describe.skip;

suite("crisis escalation PG repo", () => {
  let client: PoolClient;

  beforeAll(async () => {
    client = createPgClient(DB as string);
    await runMigrations(client);
    await applyRls(client);
  });

  afterAll(async () => {
    await client.end();
  });

  function esc(id: string, over: Partial<CrisisEscalation> = {}): CrisisEscalation {
    return {
      id,
      studentId: "pg-crisis-stu",
      tenantId: "pg-crisis-tenant",
      tier: "tier_1",
      textRef: "sealed-ciphertext",
      detectorVersion: "2026.07.03",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      deliveredTo: ["counselor@school"],
      deliveredAt: new Date("2026-07-01T00:01:00Z"),
      acknowledgedAt: null,
      acknowledgedBy: null,
      undelivered: false,
      attempts: 1,
      lastAttemptAt: new Date("2026-07-01T00:01:00Z"),
      ...over,
    };
  }

  it("round-trips an escalation and lists it as pending until acknowledged", async () => {
    const repo = createPgCrisisEscalationRepository(client);
    await repo.save(esc("pg-esc-1"));

    const found = await repo.findById("pg-esc-1");
    expect(found?.tier).toBe("tier_1");
    expect(found?.deliveredTo).toEqual(["counselor@school"]);
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(found?.acknowledgedAt).toBeNull();

    expect((await repo.listPending()).some((e) => e.id === "pg-esc-1")).toBe(true);
    expect((await repo.listByTenant("pg-crisis-tenant")).some((e) => e.id === "pg-esc-1")).toBe(true);

    // Acknowledge (upsert) → no longer pending.
    await repo.save(
      esc("pg-esc-1", {
        acknowledgedAt: new Date("2026-07-01T00:05:00Z"),
        acknowledgedBy: "counselor-1",
      }),
    );
    const acked = await repo.findById("pg-esc-1");
    expect(acked?.acknowledgedBy).toBe("counselor-1");
    expect((await repo.listPending()).some((e) => e.id === "pg-esc-1")).toBe(false);
  });
});
