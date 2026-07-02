import { describe, expect, it } from "vitest";

import type { AffectSnapshot } from "@/domain/emotion";
import type { LearningGoal } from "@/domain/goal";
import type { Outcome } from "@/domain/outcome";
import type { Prediction } from "@/domain/prediction";
import {
  classifyCalibration,
  computeCalibration,
} from "@/domain/gap/calibration";
import {
  affectValence,
  computeCongruence,
  performanceRelToGoal,
} from "@/domain/gap/congruence";
import { T_PREDICT, T_SCORE } from "../fixtures/domain";

/**
 * The three seed archetypes (P3 hand-off). Each is a full worked example proving
 * the gap engine flags the intended pattern. Numbers are printed for the report.
 */

interface Scenario {
  name: string;
  prediction: Prediction;
  outcome: Outcome;
  goal: LearningGoal;
  snapshot: AffectSnapshot;
}

function prediction(
  confidences: number[],
  globalPredicted: number,
): Prediction {
  return {
    id: "p",
    assessmentId: "a",
    studentId: "s",
    itemPredictions: confidences.map((confidence, i) => ({
      itemId: `i${i}`,
      confidence,
    })),
    globalPredicted,
    createdAt: T_PREDICT,
  };
}

function outcome(corrects: boolean[]): Outcome {
  return {
    id: "o",
    assessmentId: "a",
    studentId: "s",
    itemOutcomes: corrects.map((correct, i) => ({
      itemId: `i${i}`,
      correct,
      pointsAwarded: correct ? 1 : 0,
    })),
    scoredAt: T_SCORE,
  };
}

function goal(targetScore: number): LearningGoal {
  return {
    id: "g",
    studentId: "s",
    assessmentId: "a",
    targetScore,
    whyItMatters: "student's own reason",
    createdAt: T_PREDICT,
  };
}

function snapshot(labels: AffectSnapshot["labels"]): AffectSnapshot {
  return {
    id: "aff",
    assessmentId: "a",
    studentId: "s",
    labels,
    phase: "post_evidence",
    createdAt: T_SCORE,
  };
}

const scenarios: Scenario[] = [
  {
    // Predicted high, scored 1/4, target 0.7 — yet feels proud. THE TARGET CASE.
    name: "overconfident-low",
    prediction: prediction([0.9, 0.9, 0.9, 0.9], 0.8),
    outcome: outcome([true, false, false, false]),
    goal: goal(0.7),
    snapshot: snapshot([
      { term: "proud", valence: 0.7, arousal: 0.5 },
      { term: "relieved", valence: 0.5, arousal: 0.3 },
    ]),
  },
  {
    // Predicted low, scored 4/4 above target 0.6 — yet feels anxious/drained.
    name: "underconfident-high",
    prediction: prediction([0.3, 0.3, 0.3, 0.3], 0.4),
    outcome: outcome([true, true, true, true]),
    goal: goal(0.6),
    snapshot: snapshot([
      { term: "anxious", valence: -0.6, arousal: 0.8 },
      { term: "drained", valence: -0.4, arousal: 0.3 },
    ]),
  },
  {
    // Predicted ~0.75, scored 3/4, target 0.6 — mildly content. Aligned.
    name: "calibrated",
    prediction: prediction([0.8, 0.8, 0.7, 0.7], 0.75),
    outcome: outcome([true, true, true, false]),
    goal: goal(0.6),
    snapshot: snapshot([{ term: "content", valence: 0.3, arousal: 0.3 }]),
  },
];

describe("seed archetypes — worked examples", () => {
  const expectations = {
    "overconfident-low": {
      calibration: "overconfident",
      congruence: "over_positive",
    },
    "underconfident-high": {
      calibration: "underconfident",
      congruence: "over_negative",
    },
    calibrated: { calibration: "calibrated", congruence: "congruent" },
  } as const;

  for (const s of scenarios) {
    it(`${s.name}: flags the intended calibration + congruence pattern`, () => {
      const cal = computeCalibration(s.prediction, s.outcome);
      const calClass = classifyCalibration(cal.bias as number);
      const con = computeCongruence(s.snapshot, s.outcome, s.goal);

      console.log(
        `[${s.name}] brier=${cal.brier?.toFixed(3)} bias=${cal.bias?.toFixed(
          3,
        )} -> ${calClass} | affect=${affectValence(s.snapshot)?.toFixed(
          2,
        )} relToGoal=${performanceRelToGoal(s.outcome, s.goal)?.toFixed(
          2,
        )} gap=${con?.gap.toFixed(2)} -> ${con?.classification}`,
      );

      const expected = expectations[s.name as keyof typeof expectations];
      expect(calClass).toBe(expected.calibration);
      expect(con).not.toBeNull();
      expect(con!.classification).toBe(expected.congruence);
    });
  }
});
