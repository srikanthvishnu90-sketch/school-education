import type { Id } from "../common";
import type { AssessmentItem } from "../skill";
import type { Prediction } from "../prediction";
import type { Outcome } from "../outcome";

/**
 * The calibration engine — metacognitive monitoring accuracy. All functions are
 * PURE and referentially transparent (CLAUDE.md → "AI = labor, not judgment":
 * calibration is computed deterministically, never by an LLM).
 *
 * Every metric is over the items a student BOTH predicted and was scored on
 * (matched by itemId). Undefined-by-construction cases (no matched items, a
 * discrimination with only one outcome class) return `null` rather than throwing
 * or inventing a number — a missing measurement is not a zero.
 *
 * "Achieved" performance is fraction-correct. We deliberately do NOT divide by
 * item max-points (an `Outcome` carries no maximum), so a `maxPoints = 0` item
 * can never produce a division-by-zero here.
 */

/** A confidence paired with the truth it was predicting. */
interface Pair {
  confidence: number;
  correct: 0 | 1;
}

export interface BaseCalibration {
  /** Number of matched items the metrics are computed over. */
  n: number;
  /** Mean squared error of confidence vs correctness ∈ [0, 1]. Lower = truer. */
  brier: number | null;
  meanConfidence: number | null;
  /** Fraction correct ∈ [0, 1]. */
  accuracy: number | null;
  /** meanConfidence − accuracy ∈ [-1, 1]. >0 overconfident, <0 underconfident. */
  bias: number | null;
  /**
   * Discrimination / resolution ∈ [-1, 1]: mean confidence on CORRECT items minus
   * mean confidence on INCORRECT items. Null when every item shares one outcome
   * (nothing to discriminate).
   */
  discrimination: number | null;
}

export interface CalibrationSummary extends BaseCalibration {
  /** globalPredicted − accuracy ∈ [-1, 1]. The student's whole-test self-estimate gap. */
  globalGap: number | null;
}

export interface SkillCalibration extends BaseCalibration {
  skillId: Id;
}

export type CalibrationClass =
  "overconfident" | "underconfident" | "calibrated";

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Matches predicted items to scored items by itemId; unmatched items are ignored. */
function pairsOf(prediction: Prediction, outcome: Outcome): Pair[] {
  const correctById = new Map<Id, boolean>(
    outcome.itemOutcomes.map((o) => [o.itemId, o.correct]),
  );
  const pairs: Pair[] = [];
  for (const ip of prediction.itemPredictions) {
    const correct = correctById.get(ip.itemId);
    if (correct !== undefined) {
      pairs.push({ confidence: ip.confidence, correct: correct ? 1 : 0 });
    }
  }
  return pairs;
}

function baseFromPairs(pairs: readonly Pair[]): BaseCalibration {
  const n = pairs.length;
  if (n === 0) {
    return {
      n: 0,
      brier: null,
      meanConfidence: null,
      accuracy: null,
      bias: null,
      discrimination: null,
    };
  }

  const confidences = pairs.map((p) => p.confidence);
  const correctness = pairs.map((p) => p.correct);
  const meanConfidence = mean(confidences) as number;
  const accuracy = mean(correctness) as number;
  const brier =
    pairs.reduce((sum, p) => sum + (p.confidence - p.correct) ** 2, 0) / n;

  const correctConf = pairs
    .filter((p) => p.correct === 1)
    .map((p) => p.confidence);
  const incorrectConf = pairs
    .filter((p) => p.correct === 0)
    .map((p) => p.confidence);
  const discrimination =
    correctConf.length > 0 && incorrectConf.length > 0
      ? (mean(correctConf) as number) - (mean(incorrectConf) as number)
      : null;

  return {
    n,
    brier,
    meanConfidence,
    accuracy,
    bias: meanConfidence - accuracy,
    discrimination,
  };
}

// --- Public metric functions -------------------------------------------------

export function brier(prediction: Prediction, outcome: Outcome): number | null {
  return baseFromPairs(pairsOf(prediction, outcome)).brier;
}

export function meanConfidence(
  prediction: Prediction,
  outcome: Outcome,
): number | null {
  return baseFromPairs(pairsOf(prediction, outcome)).meanConfidence;
}

export function accuracy(
  prediction: Prediction,
  outcome: Outcome,
): number | null {
  return baseFromPairs(pairsOf(prediction, outcome)).accuracy;
}

export function bias(prediction: Prediction, outcome: Outcome): number | null {
  return baseFromPairs(pairsOf(prediction, outcome)).bias;
}

export function discrimination(
  prediction: Prediction,
  outcome: Outcome,
): number | null {
  return baseFromPairs(pairsOf(prediction, outcome)).discrimination;
}

export function globalGap(
  prediction: Prediction,
  outcome: Outcome,
): number | null {
  const acc = accuracy(prediction, outcome);
  return acc === null ? null : prediction.globalPredicted - acc;
}

/**
 * Names a bias as over/under/calibrated within a tolerance `eps`. Direction only —
 * never "good/bad" (CLAUDE.md → accuracy is never green/red).
 */
export function classifyCalibration(
  biasValue: number,
  eps = 0.1,
): CalibrationClass {
  if (biasValue > eps) return "overconfident";
  if (biasValue < -eps) return "underconfident";
  return "calibrated";
}

/** Full single-assessment summary. */
export function computeCalibration(
  prediction: Prediction,
  outcome: Outcome,
): CalibrationSummary {
  const base = baseFromPairs(pairsOf(prediction, outcome));
  const globalGapValue =
    base.accuracy === null ? null : prediction.globalPredicted - base.accuracy;
  return { ...base, globalGap: globalGapValue };
}

/**
 * Calibration broken out per skill. Items are attributed to skills via `items`
 * (itemId → skillId). Skills with no matched items are omitted. Ordered by first
 * appearance in `items` for determinism.
 */
export function perSkill(
  prediction: Prediction,
  outcome: Outcome,
  items: readonly AssessmentItem[],
): SkillCalibration[] {
  const skillByItem = new Map<Id, Id>(items.map((i) => [i.id, i.skillId]));
  const correctById = new Map<Id, boolean>(
    outcome.itemOutcomes.map((o) => [o.itemId, o.correct]),
  );

  const bySkill = new Map<Id, Pair[]>();
  const order: Id[] = [];
  for (const ip of prediction.itemPredictions) {
    const skillId = skillByItem.get(ip.itemId);
    const correct = correctById.get(ip.itemId);
    if (skillId === undefined || correct === undefined) continue;
    if (!bySkill.has(skillId)) {
      bySkill.set(skillId, []);
      order.push(skillId);
    }
    bySkill
      .get(skillId)!
      .push({ confidence: ip.confidence, correct: correct ? 1 : 0 });
  }

  return order.map((skillId) => ({
    skillId,
    ...baseFromPairs(bySkill.get(skillId)!),
  }));
}

export type TrajectoryDirection =
  "improving" | "worsening" | "flat" | "insufficient";

export interface Trajectory {
  n: number;
  /** last − first over the non-null series. Null when < 2 points. */
  delta: number | null;
  direction: TrajectoryDirection;
}

/**
 * Trend across an ordered series of a LOWER-IS-BETTER metric (e.g. Brier over
 * time). We trust trajectory over any single self-judgment (CLAUDE.md →
 * DEVELOPMENT). Nulls (unmeasurable assessments) are skipped; < 2 real points is
 * `insufficient` (never guess a trend from one dot).
 */
export function trajectory(
  series: readonly (number | null)[],
  eps = 0.02,
): Trajectory {
  const points = series.filter((v): v is number => v !== null);
  if (points.length < 2) {
    return { n: points.length, delta: null, direction: "insufficient" };
  }
  const delta = points[points.length - 1] - points[0];
  const direction: TrajectoryDirection =
    delta < -eps ? "improving" : delta > eps ? "worsening" : "flat";
  return { n: points.length, delta, direction };
}
