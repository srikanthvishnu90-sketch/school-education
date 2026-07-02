import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { AffectSnapshot } from "@/domain/emotion";
import type { LearningGoal } from "@/domain/goal";
import type { Outcome } from "@/domain/outcome";
import type { Prediction } from "@/domain/prediction";
import { bias, brier } from "@/domain/gap/calibration";
import { congruenceGap, expectedValence } from "@/domain/gap/congruence";
import { T_PREDICT, T_SCORE } from "../fixtures/domain";

interface RawPair {
  confidence: number;
  correct: boolean;
}

function build(
  pairs: readonly RawPair[],
  globalPredicted: number,
): { prediction: Prediction; outcome: Outcome } {
  return {
    prediction: {
      id: "p",
      assessmentId: "a",
      studentId: "s",
      itemPredictions: pairs.map((p, i) => ({
        itemId: `i${i}`,
        confidence: p.confidence,
      })),
      globalPredicted,
      createdAt: T_PREDICT,
    },
    outcome: {
      id: "o",
      assessmentId: "a",
      studentId: "s",
      itemOutcomes: pairs.map((p, i) => ({
        itemId: `i${i}`,
        correct: p.correct,
        pointsAwarded: p.correct ? 1 : 0,
      })),
      scoredAt: T_SCORE,
    },
  };
}

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const rawPairs = fc.array(
  fc.record({ confidence: unit, correct: fc.boolean() }),
  { minLength: 1, maxLength: 40 },
);

describe("calibration properties", () => {
  it("brier ∈ [0, 1] for any confidences and outcomes", () => {
    fc.assert(
      fc.property(rawPairs, unit, (pairs, gp) => {
        const { prediction, outcome } = build(pairs, gp);
        const b = brier(prediction, outcome);
        expect(b).not.toBeNull();
        expect(b as number).toBeGreaterThanOrEqual(-1e-12);
        expect(b as number).toBeLessThanOrEqual(1 + 1e-12);
      }),
    );
  });

  it("confidence = correctness ⇒ brier = 0 and bias = 0 (perfect calibration)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        (corrects) => {
          const pairs = corrects.map((c) => ({
            confidence: c ? 1 : 0,
            correct: c,
          }));
          const { prediction, outcome } = build(pairs, 0.5);
          expect(brier(prediction, outcome) as number).toBeCloseTo(0, 12);
          expect(bias(prediction, outcome) as number).toBeCloseTo(0, 12);
        },
      ),
    );
  });

  it("confidence = 0.5 everywhere ⇒ brier = 0.25 regardless of outcomes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        (corrects) => {
          const pairs = corrects.map((c) => ({ confidence: 0.5, correct: c }));
          const { prediction, outcome } = build(pairs, 0.5);
          expect(brier(prediction, outcome) as number).toBeCloseTo(0.25, 12);
        },
      ),
    );
  });
});

describe("congruence properties", () => {
  const valence = fc.double({ min: -1, max: 1, noNaN: true });
  const arousal = unit;
  const labels = fc.array(
    fc.record({ term: fc.constant("e"), valence, arousal }),
    { minLength: 1, maxLength: 20 },
  );

  it("congruenceGap ∈ [-2, 2]", () => {
    fc.assert(
      fc.property(
        labels,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        unit,
        (ls, corrects, target) => {
          const snapshot: AffectSnapshot = {
            id: "aff",
            assessmentId: "a",
            studentId: "s",
            labels: ls,
            phase: "post_evidence",
            createdAt: T_SCORE,
          };
          const outcome: Outcome = {
            id: "o",
            assessmentId: "a",
            studentId: "s",
            itemOutcomes: corrects.map((c, i) => ({
              itemId: `i${i}`,
              correct: c,
              pointsAwarded: c ? 1 : 0,
            })),
            scoredAt: T_SCORE,
          };
          const goal: LearningGoal = {
            id: "g",
            studentId: "s",
            assessmentId: "a",
            targetScore: target,
            whyItMatters: "x",
            createdAt: T_PREDICT,
          };
          const gap = congruenceGap(snapshot, outcome, goal);
          expect(gap).not.toBeNull();
          expect(gap as number).toBeGreaterThanOrEqual(-2 - 1e-12);
          expect(gap as number).toBeLessThanOrEqual(2 + 1e-12);
        },
      ),
    );
  });

  it("expectedValence is odd (sign symmetry) and monotonic on [-1, 1]", () => {
    fc.assert(
      fc.property(valence, valence, (a, b) => {
        expect(expectedValence(-a)).toBeCloseTo(-expectedValence(a), 12);
        if (a <= b) {
          expect(expectedValence(a)).toBeLessThanOrEqual(expectedValence(b));
        }
      }),
    );
  });
});
