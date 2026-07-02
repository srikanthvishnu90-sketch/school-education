import type { AffectSnapshot } from "@/domain/emotion";
import type { LearningGoal } from "@/domain/goal";
import type { Outcome } from "@/domain/outcome";
import type { Prediction } from "@/domain/prediction";
import type { Attribution, Reflection } from "@/domain/reflection";

/**
 * Valid-by-construction fixtures. Every builder returns a well-formed entity;
 * tests apply `overrides` to violate exactly one invariant at a time. Dates are
 * fixed literals so ordering assertions are deterministic.
 */

export const T_PREDICT = new Date("2026-01-01T10:00:00.000Z");
export const T_SCORE = new Date("2026-01-01T11:00:00.000Z");

export function makeGoal(overrides: Partial<LearningGoal> = {}): LearningGoal {
  return {
    id: "goal-1",
    studentId: "stu-1",
    assessmentId: "assess-1",
    targetScore: 0.8,
    whyItMatters: "I want to teach this to my sister.",
    createdAt: T_PREDICT,
    ...overrides,
  };
}

export function makePrediction(
  overrides: Partial<Prediction> = {},
): Prediction {
  return {
    id: "pred-1",
    assessmentId: "assess-1",
    studentId: "stu-1",
    itemPredictions: [
      { itemId: "item-1", confidence: 0.9 },
      { itemId: "item-2", confidence: 0.4 },
    ],
    globalPredicted: 0.7,
    createdAt: T_PREDICT,
    ...overrides,
  };
}

export function makeOutcome(overrides: Partial<Outcome> = {}): Outcome {
  return {
    id: "out-1",
    assessmentId: "assess-1",
    studentId: "stu-1",
    itemOutcomes: [
      { itemId: "item-1", correct: true, pointsAwarded: 1 },
      { itemId: "item-2", correct: false, pointsAwarded: 0 },
    ],
    scoredAt: T_SCORE,
    ...overrides,
  };
}

export const productiveAttribution: Attribution = {
  category: "strategy",
  specific: true,
  controllable: true,
  note: "I skimmed the setup instead of writing the givens down first.",
};

export function makeReflection(
  overrides: Partial<Reflection> = {},
): Reflection {
  return {
    id: "ref-1",
    assessmentId: "assess-1",
    studentId: "stu-1",
    attribution: productiveAttribution,
    nextAction: {
      text: "Redo items 1-2 writing every given first.",
      dueBy: T_SCORE,
    },
    exemplarReviewed: true,
    createdAt: T_SCORE,
    ...overrides,
  };
}

export function makeAffectSnapshot(
  overrides: Partial<AffectSnapshot> = {},
): AffectSnapshot {
  return {
    id: "aff-1",
    assessmentId: "assess-1",
    studentId: "stu-1",
    labels: [{ term: "uneasy", valence: -0.3, arousal: 0.6 }],
    phase: "post_evidence",
    createdAt: T_SCORE,
    ...overrides,
  };
}
