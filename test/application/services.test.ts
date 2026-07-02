import { beforeEach, describe, expect, it } from "vitest";

import type { Assessment } from "@/domain/skill";
import {
  createAffectRepository,
  createAssessmentRepository,
  createGoalRepository,
  createOutcomeRepository,
  createPredictionRepository,
  createReflectionRepository,
  createSequentialClock,
  createSequentialIdGenerator,
  createTransferProbeRepository,
} from "@/adapters/memory";
import {
  createServices,
  EmptyAffectError,
  ItemCoverageError,
  NonProductiveAttributionError,
  NotFoundError,
  PredictionAfterOutcomeError,
  type Services,
} from "@/application";
import type { PredictionRepository } from "@/domain/ports";

const A_ID = "assess-1";

const assessment: Assessment = {
  id: A_ID,
  title: "Test",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  items: [
    {
      id: "item-1",
      assessmentId: A_ID,
      skillId: "sk",
      prompt: "?",
      maxPoints: 1,
    },
    {
      id: "item-2",
      assessmentId: A_ID,
      skillId: "sk",
      prompt: "?",
      maxPoints: 1,
    },
  ],
};

function fullPrediction() {
  return {
    studentId: "s1",
    assessmentId: A_ID,
    itemPredictions: [
      { itemId: "item-1", confidence: 0.8 },
      { itemId: "item-2", confidence: 0.4 },
    ],
    globalPredicted: 0.6,
  };
}

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
let predictions: PredictionRepository;

beforeEach(async () => {
  const assessments = createAssessmentRepository();
  predictions = createPredictionRepository();
  await assessments.save(assessment);
  services = createServices({
    clock: createSequentialClock(Date.UTC(2026, 0, 5, 9, 0, 0)),
    ids: createSequentialIdGenerator(),
    assessments,
    goals: createGoalRepository(),
    predictions,
    outcomes: createOutcomeRepository(),
    reflections: createReflectionRepository(),
    transferProbes: createTransferProbeRepository(),
    affects: createAffectRepository(),
  });
});

describe("happy paths — the SRL loop runs", () => {
  it("captureGoal → capturePrediction → recordOutcome → computeGap", async () => {
    await services.captureGoal({
      studentId: "s1",
      assessmentId: A_ID,
      targetScore: 0.9,
      whyItMatters: "reason",
    });
    const prediction = await services.capturePrediction(fullPrediction());
    expect(prediction.itemPredictions).toHaveLength(2);

    await services.recordOutcome(fullOutcome());
    await services.captureAffect({
      studentId: "s1",
      assessmentId: A_ID,
      labels: [{ term: "proud", valence: 0.7, arousal: 0.5 }],
      phase: "post_evidence",
    });

    const gap = await services.computeGap(A_ID, "s1");
    expect(gap.calibration.n).toBe(2);
    expect(gap.calibration.accuracy).toBeCloseTo(0.5, 10);
    // affect 0.7, accuracy 0.5 vs goal 0.9 ⇒ relToGoal -0.4 ⇒ gap 1.1 ⇒ over_positive
    expect(gap.congruence?.classification).toBe("over_positive");
    expect(gap.granularity).toBe(1);
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

describe("computeGap refuses congruence without a goal", () => {
  it("returns calibration only (congruence null) when no goal exists", async () => {
    await services.capturePrediction(fullPrediction());
    await services.recordOutcome(fullOutcome());
    await services.captureAffect({
      studentId: "s1",
      assessmentId: A_ID,
      labels: [{ term: "proud", valence: 0.7, arousal: 0.5 }],
      phase: "post_evidence",
    });
    const gap = await services.computeGap(A_ID, "s1");
    expect(gap.calibration.n).toBe(2);
    expect(gap.congruence).toBeNull();
  });
});

describe("typed errors", () => {
  it("ItemCoverageError when the prediction misses an item", async () => {
    await expect(
      services.capturePrediction({
        studentId: "s1",
        assessmentId: A_ID,
        itemPredictions: [{ itemId: "item-1", confidence: 0.5 }],
        globalPredicted: 0.5,
      }),
    ).rejects.toBeInstanceOf(ItemCoverageError);
  });

  it("ItemCoverageError when the prediction adds an unknown item", async () => {
    await expect(
      services.capturePrediction({
        studentId: "s1",
        assessmentId: A_ID,
        itemPredictions: [
          { itemId: "item-1", confidence: 0.5 },
          { itemId: "item-2", confidence: 0.5 },
          { itemId: "item-99", confidence: 0.5 },
        ],
        globalPredicted: 0.5,
      }),
    ).rejects.toBeInstanceOf(ItemCoverageError);
  });

  it("PredictionAfterOutcomeError when the prediction is not registered first", async () => {
    // Prediction stamped in the far future, recorded outcome uses the (earlier) clock.
    await predictions.save({
      id: "pred-late",
      assessmentId: A_ID,
      studentId: "s1",
      itemPredictions: [
        { itemId: "item-1", confidence: 0.5 },
        { itemId: "item-2", confidence: 0.5 },
      ],
      globalPredicted: 0.5,
      createdAt: new Date("2100-01-01T00:00:00.000Z"),
    });
    await expect(services.recordOutcome(fullOutcome())).rejects.toBeInstanceOf(
      PredictionAfterOutcomeError,
    );
  });

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

  it("NotFoundError for recordOutcome without a prior prediction", async () => {
    await expect(services.recordOutcome(fullOutcome())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
