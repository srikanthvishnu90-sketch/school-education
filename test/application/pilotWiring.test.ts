import { describe, expect, it } from "vitest";

import {
  affectSkipRate,
  honestEngagementRate,
} from "@/domain";
import { buildAssessment, buildWorldCore } from "@/application";

/**
 * P17 telemetry is now WIRED into the composition (buildWorldCore.telemetry over a
 * real pilot-event repo). This proves events flow end to end — consent-gated,
 * pseudonymized, with the quarantine mechanic read in the application layer — and
 * that the measurement queries compute over what was emitted.
 */
describe("wired pilot telemetry", () => {
  it("records a pseudonymized cycle, including the quarantine mechanic, and measures it", async () => {
    const core = buildWorldCore();
    const assessment = buildAssessment();
    await core.repos.assessments.save(assessment);

    const STUDENT = "student-real-1";
    await core.consentService.grant({
      studentId: STUDENT,
      grantorType: "parent",
      scopes: ["academic", "telemetry"],
    });

    // A straight-lined prediction quarantines (P15); capture returns the session id.
    const prediction = await core.services.capturePrediction({
      studentId: STUDENT,
      assessmentId: assessment.id,
      itemPredictions: assessment.items.map((item) => ({
        itemId: item.id,
        confidence: 0.9,
      })),
      globalPredicted: 0.9,
      screenLatenciesMs: [100, 120, 90, 110, 80],
    });

    const M = { studentId: STUDENT, tenantId: "school-1", cycleN: 1 } as const;
    await core.telemetry.record({ ...M, type: "cycle_started" });
    await core.telemetry.record({ ...M, type: "prediction_completed" });
    const notedQuarantine = await core.telemetry.noteQuarantine({
      studentId: STUDENT,
      tenantId: "school-1",
      sessionId: prediction.id,
      cycleN: 1,
    });
    await core.telemetry.record({ ...M, type: "affect_skipped" });
    await core.telemetry.record({ ...M, type: "cycle_completed" });

    expect(notedQuarantine).toBe(true); // the mechanic fired

    const events = await core.repos.pilotEvents.list();
    // Every stored event is pseudonymized — the real id never appears.
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.every((e) => e.studentId !== STUDENT)).toBe(true);
    expect(events.some((e) => e.type === "session_quarantined")).toBe(true);

    // The measurement queries compute over what flowed.
    expect(affectSkipRate(events, { minN: 1, windowMs: 1, budgetMs: 1 }).value?.overall).toBe(1);
    // One completed cycle, and it was quarantined → 0% honest-engagement.
    expect(
      honestEngagementRate(events, { minN: 1, windowMs: 1, budgetMs: 1 }).value,
    ).toBe(0);
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
