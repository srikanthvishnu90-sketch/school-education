import { DomainError, type Id } from "./common";
import {
  trajectory,
  type SkillCalibration,
  type TrajectoryDirection,
} from "./gap/calibration";
import { actionVerificationSchema } from "./schemas/academic";

/**
 * The verification cycle — the honest close of the loop. A committed next action
 * TARGETS a skill; the only trustworthy evidence it worked is behavioral: the
 * targeted skill moving on the NEXT assessment that actually measures it
 * (CLAUDE.md → SAFETY: reflection → action → measured change on the TARGETED
 * skill). One cycle is noise; verdicts accumulate.
 *
 * This module is PURE. It compares a baseline measure to a follow-up measure and
 * returns verdicts; it never selects the follow-up, touches a clock, or calls a
 * model. Two things are judged SEPARATELY and never conflated:
 *   - accuracy  (did the student get BETTER at the skill?)
 *   - calibration/brier (did the student get better at KNOWING what they know?)
 * A student can gain one without the other, so they carry independent verdicts.
 */

export type VerificationVerdict =
  | "improved"
  | "flat"
  | "regressed"
  | "pending"
  | "inconclusive";

/** A single skill's measured state on one assessment. */
export interface SkillMeasure {
  skillId: Id;
  /** Fraction correct on this skill's items ∈ [0, 1]. */
  accuracy: number;
  /** Brier over this skill's items (lower = truer). Absent when unmeasurable. */
  brier?: number;
  /** Number of matched items the measure is computed over; below the min → inconclusive. */
  itemCount: number;
}

/**
 * The confound guard's ledger: skills OTHER than the target that were also
 * measured in the follow-up evidence. Recorded so a reviewer can see what else
 * moved that cycle — but NEVER credited to the action (only `targetSkillId`
 * counts as intervention evidence).
 */
export interface SkillDrift {
  skillId: Id;
  accuracy: number;
}

export interface ActionVerification {
  id: Id;
  /** The committed next action being verified (a reflection's id owns its one action). */
  nextActionId: Id;
  studentId: Id;
  targetSkillId: Id;
  openedAt: Date;
  baseline: SkillMeasure;
  /** The assessment the baseline came from — never bound as its own follow-up. */
  baselineAssessmentId: Id;
  followup?: SkillMeasure;
  followupAssessmentId?: Id;
  /** Did the student get BETTER at the skill? Independent of calibration. */
  accuracyVerdict: VerificationVerdict;
  /** Did the student get better at KNOWING the skill? Independent of accuracy. */
  calibrationVerdict: VerificationVerdict;
  untargetedDrift?: SkillDrift[];
  /** Set when a verdict is reached (follow-up bound) or the window expires. */
  closedAt?: Date;
}

export interface VerificationConfig {
  /** Min |Δaccuracy| to call improved/regressed rather than flat. */
  tauAccuracy: number;
  /** Min |Δbrier| to call improved/regressed rather than flat. */
  tauBrier: number;
  /** Both measures need at least this many items, else inconclusive (never a false verdict). */
  minItems: number;
  /** No re-test of the skill within this window → expire as inconclusive. */
  stalenessHorizonMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  tauAccuracy: 0.05,
  tauBrier: 0.02,
  minItems: 3,
  stalenessHorizonMs: 30 * DAY_MS,
};

export interface VerifyResult {
  accuracyVerdict: VerificationVerdict;
  calibrationVerdict: VerificationVerdict;
}

/** Higher-is-better delta → verdict within a tolerance. */
function classifyHigherBetter(
  delta: number,
  tau: number,
): "improved" | "flat" | "regressed" {
  if (delta > tau) return "improved";
  if (delta < -tau) return "regressed";
  return "flat";
}

/** Lower-is-better delta (e.g. Brier) → verdict within a tolerance. */
function classifyLowerBetter(
  delta: number,
  tau: number,
): "improved" | "flat" | "regressed" {
  if (delta < -tau) return "improved";
  if (delta > tau) return "regressed";
  return "flat";
}

/**
 * Compares one skill's baseline to its follow-up on accuracy AND brier
 * SEPARATELY. Below the item floor on either measure yields `inconclusive` — a
 * thin follow-up must never manufacture a verdict. Comparing two different skills
 * is a programming error, not a verdict, so it throws.
 */
export function verifyAction(
  baseline: SkillMeasure,
  followup: SkillMeasure,
  config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG,
): VerifyResult {
  if (baseline.skillId !== followup.skillId) {
    throw new DomainError(
      `verifyAction compares a single skill; got baseline ${baseline.skillId} vs follow-up ${followup.skillId}`,
    );
  }

  const enoughItems =
    baseline.itemCount >= config.minItems &&
    followup.itemCount >= config.minItems;

  const accuracyVerdict: VerificationVerdict = enoughItems
    ? classifyHigherBetter(followup.accuracy - baseline.accuracy, config.tauAccuracy)
    : "inconclusive";

  const calibrationVerdict: VerificationVerdict =
    enoughItems && baseline.brier !== undefined && followup.brier !== undefined
      ? classifyLowerBetter(followup.brier - baseline.brier, config.tauBrier)
      : "inconclusive";

  return { accuracyVerdict, calibrationVerdict };
}

/**
 * A calibration trajectory across a skill's accumulated measures, reusing the P3
 * trajectory (min-n gate: < 2 real Brier points → "insufficient", never a claim
 * from a single dot). Ordered oldest → newest by the caller.
 */
export function calibrationTrajectoryVerdict(
  history: readonly SkillMeasure[],
): TrajectoryDirection {
  return trajectory(history.map((m) => m.brier ?? null)).direction;
}

/**
 * Projects a per-skill calibration into a SkillMeasure, or null when the skill
 * was not actually measured (no matched items → not a zero). Null is the caller's
 * signal that this evidence does NOT contain the skill.
 */
export function toSkillMeasure(sc: SkillCalibration): SkillMeasure | null {
  if (sc.n === 0 || sc.accuracy === null) return null;
  return {
    skillId: sc.skillId,
    accuracy: sc.accuracy,
    brier: sc.brier ?? undefined,
    itemCount: sc.n,
  };
}

/** True once the re-test window has elapsed with no binding follow-up. */
export function isStale(
  verification: ActionVerification,
  now: Date,
  config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG,
): boolean {
  return now.getTime() - verification.openedAt.getTime() > config.stalenessHorizonMs;
}

/** Validates + freezes an ActionVerification at any lifecycle state. */
export function createActionVerification(
  input: ActionVerification,
): ActionVerification {
  const parsed = actionVerificationSchema.parse(input);
  if (parsed.baseline.skillId !== parsed.targetSkillId) {
    throw new DomainError(
      `baseline measures ${parsed.baseline.skillId} but the action targets ${parsed.targetSkillId}`,
    );
  }
  if (
    parsed.followup !== undefined &&
    parsed.followup.skillId !== parsed.targetSkillId
  ) {
    throw new DomainError(
      `follow-up measures ${parsed.followup.skillId} but the action targets ${parsed.targetSkillId}`,
    );
  }
  return Object.freeze(parsed);
}
