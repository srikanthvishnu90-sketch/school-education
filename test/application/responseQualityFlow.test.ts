import { describe, expect, it } from "vitest";

import {
  buildAssessment,
  buildWorldCore,
  createObserver,
  interventionPolicy,
} from "@/application";

/**
 * The honesty architecture, wired end to end (P15): a straight-lined prediction
 * session is quarantined at capture, and the agent refuses to act on its (severe)
 * gap — it re-engages quietly, and NEVER escalates a quarantined session to a
 * teacher flag. Quarantine is never surfaced to anyone.
 */

const STUDENT = "student-avery";

describe("straight-lined session quarantines and re-engages (never flags)", () => {
  it("captures a quarantine, then the agent re-engages rather than flags the gap", async () => {
    const core = buildWorldCore();
    const assessment = buildAssessment();
    await core.repos.assessments.save(assessment);

    // A straight-lined, implausibly fast prediction: max confidence on every item.
    const prediction = await core.services.capturePrediction({
      studentId: STUDENT,
      assessmentId: assessment.id,
      itemPredictions: assessment.items.map((item) => ({
        itemId: item.id,
        confidence: 0.95,
      })),
      globalPredicted: 0.95,
      screenLatenciesMs: [200, 150, 180, 220, 160],
    });

    // The session was quarantined at capture (straight-lining fired).
    const quality = await core.repos.responseQuality.findBySession(prediction.id);
    expect(quality?.quarantined).toBe(true);
    expect(quality?.signals).toContain("straightlining");

    // Reveal a severe gap: confident on everything, wrong on everything. Absent
    // the quarantine, this would flag_to_teacher.
    await core.services.recordOutcome({
      studentId: STUDENT,
      assessmentId: assessment.id,
      itemOutcomes: assessment.items.map((item) => ({
        itemId: item.id,
        correct: false,
        pointsAwarded: 0,
      })),
    });

    const observer = createObserver({
      clock: core.clock,
      assessments: core.repos.assessments,
      predictions: core.repos.predictions,
      outcomes: core.repos.outcomes,
      goals: core.repos.goals,
      affects: core.repos.affects,
      reflections: core.repos.reflections,
      calibrations: core.repos.calibrations,
      verifications: core.repos.verifications,
      flagAcks: core.repos.flagAcks,
      responseQuality: core.repos.responseQuality,
    });

    const observation = await observer.observe(assessment.id, STUDENT);
    expect(observation.sessionQuarantined).toBe(true);

    const decision = interventionPolicy(observation);
    expect(decision.intervention).toBe("schedule_reengagement");
    expect(decision.intervention).not.toBe("flag_to_teacher");
  });
});
