import { beforeEach, describe, expect, it } from "vitest";

import type { Assessment } from "@/domain/skill";
import {
  createAffectRepository,
  createAssessmentRepository,
  createGoalRepository,
  createOutcomeRepository,
  createReflectionRepository,
  createSequentialClock,
  createSequentialIdGenerator,
  createTransferProbeRepository,
} from "@/adapters/memory";
import {
  createServices,
  EmptyAffectError,
  NonProductiveAttributionError,
  NotFoundError,
  type Services,
} from "@/application";

const A_ID = "assess-1";

const assessment: Assessment = {
  id: A_ID,
  title: "Test",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  items: [
    { id: "item-1", assessmentId: A_ID, skillId: "sk", prompt: "?", maxPoints: 1 },
    { id: "item-2", assessmentId: A_ID, skillId: "sk", prompt: "?", maxPoints: 1 },
  ],
};

function fullOutcome() {
  return {
    studentId: "s1",
    assessmentId: A_ID,
    itemOutcomes: [
      { itemId: "item-1", correct: true, pointsAwarded: 1 },
      { itemId: "item-2", correct: false, pointsAwarded: 0 },
    ],
  };
}

let services: Services;

beforeEach(async () => {
  const assessments = createAssessmentRepository();
  await assessments.save(assessment);
  services = createServices({
    clock: createSequentialClock(Date.UTC(2026, 0, 5, 9, 0, 0)),
    ids: createSequentialIdGenerator(),
    assessments,
    goals: createGoalRepository(),
    outcomes: createOutcomeRepository(),
    reflections: createReflectionRepository(),
    transferProbes: createTransferProbeRepository(),
    affects: createAffectRepository(),
  });
});

describe("happy paths — the surviving services run", () => {
  it("captureGoal → recordOutcome records an outcome directly (no prior prediction)", async () => {
    await services.captureGoal({
      studentId: "s1",
      assessmentId: A_ID,
      targetScore: 0.9,
      whyItMatters: "reason",
    });
    const outcome = await services.recordOutcome(fullOutcome());
    expect(outcome.itemOutcomes).toHaveLength(2);
    expect(outcome.studentId).toBe("s1");
  });

  it("captureAffect returns granularity", async () => {
    const result = await services.captureAffect({
      studentId: "s1",
      assessmentId: A_ID,
      labels: [
        { term: "anxious", valence: -0.6, arousal: 0.8 },
        { term: "calm", valence: 0.4, arousal: 0.1 },
      ],
      phase: "post_evidence",
    });
    expect(result.granularity).toBe(2);
  });

  it("submitReflection then commitNextAction updates the dated action", async () => {
    const reflection = await services.submitReflection({
      studentId: "s1",
      assessmentId: A_ID,
      attribution: {
        category: "strategy",
        specific: true,
        controllable: true,
        note: "skimmed the setup",
      },
      nextAction: { text: "write givens first", dueBy: new Date("2026-01-10") },
      exemplarReviewed: true,
    });
    const updated = await services.commitNextAction(reflection.id, {
      text: "redo items writing givens first",
      dueBy: new Date("2026-01-12"),
    });
    expect(updated.id).toBe(reflection.id);
    expect(updated.nextAction.text).toBe("redo items writing givens first");
  });

  it("serveTransferProbe then recordProbeResult", async () => {
    const probe = await services.serveTransferProbe({
      assessmentId: A_ID,
      skillId: "sk",
      itemId: "item-9",
    });
    const result = await services.recordProbeResult(probe.id, true);
    expect(result.probe.id).toBe(probe.id);
    expect(result.correct).toBe(true);
  });
});

describe("typed errors", () => {
  it("EmptyAffectError when the snapshot names no state", async () => {
    await expect(
      services.captureAffect({
        studentId: "s1",
        assessmentId: A_ID,
        labels: [],
        phase: "post_evidence",
      }),
    ).rejects.toBeInstanceOf(EmptyAffectError);
  });

  it("NonProductiveAttributionError on a stable/global attribution", async () => {
    await expect(
      services.submitReflection({
        studentId: "s1",
        assessmentId: A_ID,
        attribution: {
          category: "ability",
          specific: false,
          controllable: false,
          note: "I'm bad at math",
        },
        nextAction: { text: "x", dueBy: new Date("2026-01-10") },
        exemplarReviewed: true,
      }),
    ).rejects.toBeInstanceOf(NonProductiveAttributionError);
  });

  it("NotFoundError for a transfer probe that was never served", async () => {
    await expect(services.recordProbeResult("nope", true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
