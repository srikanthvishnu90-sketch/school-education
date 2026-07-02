import type { AffectSnapshot } from "../emotion";
import type { LearningGoal } from "../goal";
import type { Outcome } from "../outcome";

/**
 * The congruence engine — does the student's FEELING match their performance
 * RELATIVE TO THEIR OWN GOAL? (Hattie feed-up makes it goal-referenced.)
 *
 * Critical product rule (CLAUDE.md → "Congruence is a flag, never a verdict"):
 * this never prescribes or outputs a "correct" emotion. It returns a signed gap
 * and a DIRECTION only. Intervention on incongruence is to increase granularity
 * (decompose the feeling), never to tell a student what to feel. And with no
 * goal, we return null — we never guess the student's target.
 */

export type CongruenceClass = "over_positive" | "over_negative" | "congruent";

export interface Congruence {
  /** affectValence − expectedValence ∈ [-2, 2]. */
  gap: number;
  classification: CongruenceClass;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Mean valence of the named states ∈ [-1, 1]. Precondition: the snapshot names at
 * least one state (enforced at the domain layer — createAffectSnapshot rejects
 * empty). Defensive null only if that guarantee is somehow bypassed.
 */
export function affectValence(snapshot: AffectSnapshot): number | null {
  const labels = snapshot.labels;
  if (labels.length === 0) return null;
  const sum = labels.reduce((acc, l) => acc + l.valence, 0);
  return clamp(sum / labels.length, -1, 1);
}

/**
 * Performance relative to the student's OWN target: achievedFraction − targetScore
 * ∈ [-1, 1]. achievedFraction is fraction-correct (no max-points division; see
 * calibration.ts). Null when the outcome scored no items.
 */
export function performanceRelToGoal(
  outcome: Outcome,
  goal: LearningGoal,
): number | null {
  const items = outcome.itemOutcomes;
  if (items.length === 0) return null;
  const achievedFraction =
    items.reduce((acc, o) => acc + (o.correct ? 1 : 0), 0) / items.length;
  return clamp(achievedFraction - goal.targetScore, -1, 1);
}

/**
 * Monotonic, sign-symmetric map from performance-relative-to-goal to the valence
 * one would expect: doing BETTER than target ⇒ more pleasant. Identity on
 * [-1, 1] — the simplest odd, monotonic map (expectedValence(−x) = −expectedValence(x)).
 */
export function expectedValence(relToGoal: number): number {
  return clamp(relToGoal, -1, 1);
}

/**
 * The signed congruence gap ∈ [-2, 2]: how much more (or less) pleasant the
 * student FEELS than their performance-vs-goal would predict. Null when
 * performance is unmeasurable (no scored items).
 */
export function congruenceGap(
  snapshot: AffectSnapshot,
  outcome: Outcome,
  goal: LearningGoal,
): number | null {
  const affect = affectValence(snapshot);
  const rel = performanceRelToGoal(outcome, goal);
  if (affect === null || rel === null) return null;
  return affect - expectedValence(rel);
}

/**
 * Names the gap. `over_positive` is the target case — "feels good about a 50":
 * the student feels better than the evidence-vs-goal warrants. `over_negative`
 * is the imposter/anxiety pattern. Direction only, never a verdict.
 */
export function classifyCongruence(gap: number, delta = 0.6): CongruenceClass {
  if (gap > delta) return "over_positive";
  if (gap < -delta) return "over_negative";
  return "congruent";
}

/**
 * The detector. Returns null when there is no goal (we never guess the student's
 * target) or performance is unmeasurable. Otherwise a signed gap + direction.
 */
export function computeCongruence(
  snapshot: AffectSnapshot,
  outcome: Outcome,
  goal: LearningGoal | null,
  delta = 0.6,
): Congruence | null {
  if (goal === null) return null;
  const gap = congruenceGap(snapshot, outcome, goal);
  if (gap === null) return null;
  return { gap, classification: classifyCongruence(gap, delta) };
}
