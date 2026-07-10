import { describe, expect, it } from "vitest";

import { affectSkipRate, honestEngagementRate } from "@/domain";
import { buildWorldCore } from "@/application";

/**
 * P17 telemetry is WIRED into the composition (buildWorldCore.telemetry over a
 * real pilot-event repo). This proves events flow end to end — consent-gated,
 * pseudonymized — and that the measurement queries compute over what was emitted.
 */
describe("wired pilot telemetry", () => {
  it("records a pseudonymized cycle and measures it", async () => {
    const core = buildWorldCore();

    const STUDENT = "student-real-1";
    await core.consentService.grant({
      studentId: STUDENT,
      grantorType: "parent",
      scopes: ["academic", "telemetry"],
    });

    const M = { studentId: STUDENT, tenantId: "school-1", cycleN: 1 } as const;
    await core.telemetry.record({ ...M, type: "cycle_started" });
    await core.telemetry.record({ ...M, type: "affect_skipped" });
    await core.telemetry.record({ ...M, type: "cycle_completed" });

    const events = await core.repos.pilotEvents.list();
    // Every stored event is pseudonymized — the real id never appears.
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.every((e) => e.studentId !== STUDENT)).toBe(true);

    // The measurement queries compute over what flowed.
    expect(
      affectSkipRate(events, { minN: 1, windowMs: 1, budgetMs: 1 }).value?.overall,
    ).toBe(1);
    // One completed cycle, none quarantined → 100% honest-engagement.
    expect(
      honestEngagementRate(events, { minN: 1, windowMs: 1, budgetMs: 1 }).value,
    ).toBe(1);
  });

  it("writes nothing for a student without telemetry consent", async () => {
    const core = buildWorldCore();
    const wrote = await core.telemetry.record({
      studentId: "no-consent",
      tenantId: "school-1",
      type: "cycle_completed",
      cycleN: 1,
    });
    expect(wrote).toBe(false);
    expect(await core.repos.pilotEvents.list()).toHaveLength(0);
  });
});
