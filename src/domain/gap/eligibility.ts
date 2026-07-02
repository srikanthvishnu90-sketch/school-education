import type { AssessmentItem } from "../skill";
import type { Prediction } from "../prediction";
import type { Outcome } from "../outcome";
import {
  computeCalibration,
  perSkill,
  type CalibrationSummary,
  type SkillCalibration,
} from "./calibration";

/**
 * The evidence eligibility gate — deterministic, zero-LLM, the core judgment
 * of the evidence pipeline (CLAUDE.md → "AI = labor, not judgment"). It decides
 * WHETHER the calibration engine in ./calibration runs on a piece of ingested
 * evidence; it never reimplements the math.
 *
 * The ladder, strongest evidence first:
 *   full     — a pre-registered prediction (createdAt strictly before scoredAt)
 *              covers the scored items, item-level correctness is present, and
 *              scored items carry real skill tags → full calibration + perSkill.
 *   item     — same, but no scored item carries a skill tag → item-level
 *              calibration only; the per-skill breakdown is withheld rather
 *              than invented.
 *   global   — the prediction pre-registers but only an assignment-level total
 *              exists → globalGap only (predicted score vs achieved fraction).
 *   baseline — no prior prediction (or one made after the result was known, or
 *              one that does not cover the scored items). Historical grades are
 *              NEVER calibration data; they are baseline evidence for the
 *              LearningMap only.
 */

/** Sentinel skillId the normalizer assigns to items with no skill tag. */
export const UNTAGGED_SKILL_ID = "skill-untagged";

/** An assignment-level total, for rows with no item detail. */
export interface EvidenceTotals {
  pointsAwarded: number;
  /** Must be > 0 (the normalizer rejects zero/negative maxima). */
  maxPoints: number;
}

export type EligibilityLevel = "full" | "item" | "global" | "baseline";

export interface EligibilityDecision {
  level: EligibilityLevel;
  /** True unless `level` is "baseline". */
  calibrationEligible: boolean;
  /** True only when `level` is "full". */
  perSkillEligible: boolean;
  /** Deterministic, human-readable grounds for the decision. */
  reasons: string[];
}

export interface EvidenceInput {
  /** The student's pre-registered prediction for this assessment, if any. */
  prediction: Prediction | null;
  outcome: Outcome;
  /** The assessment's item definitions (source of the item → skill mapping). */
  items: readonly AssessmentItem[];
  totals: EvidenceTotals | null;
}

/**
 * True when every scored item was pre-registered in the prediction. Vacuously
 * true for a total-only outcome (no item outcomes to cover).
 */
export function predictionCoversOutcome(
  prediction: Prediction,
  outcome: Outcome,
): boolean {
  const predicted = new Set(prediction.itemPredictions.map((ip) => ip.itemId));
  return outcome.itemOutcomes.every((io) => predicted.has(io.itemId));
}

function baseline(reason: string): EligibilityDecision {
  return {
    level: "baseline",
    calibrationEligible: false,
    perSkillEligible: false,
    reasons: [reason],
  };
}

export function decideEligibility(input: EvidenceInput): EligibilityDecision {
  const { prediction, outcome, items, totals } = input;

  if (prediction === null) {
    return baseline(
      "no pre-registered prediction; a historical grade is baseline evidence only",
    );
  }
  if (prediction.createdAt.getTime() >= outcome.scoredAt.getTime()) {
    return baseline(
      "prediction was not created strictly before the outcome was scored",
    );
  }
  if (!predictionCoversOutcome(prediction, outcome)) {
    return baseline("prediction does not cover the scored items");
  }

  if (outcome.itemOutcomes.length > 0) {
    const scoredIds = new Set(outcome.itemOutcomes.map((io) => io.itemId));
    const tagged = items.some(
      (item) => scoredIds.has(item.id) && item.skillId !== UNTAGGED_SKILL_ID,
    );
    if (tagged) {
      return {
        level: "full",
        calibrationEligible: true,
        perSkillEligible: true,
        reasons: [
          "pre-registered prediction covers item-level correctness",
          "scored items carry skill tags",
        ],
      };
    }
    return {
      level: "item",
      calibrationEligible: true,
      perSkillEligible: false,
      reasons: [
        "pre-registered prediction covers item-level correctness",
        "no scored item carries a skill tag; per-skill breakdown withheld",
      ],
    };
  }

  if (totals !== null) {
    return {
      level: "global",
      calibrationEligible: true,
      perSkillEligible: false,
      reasons: [
        "assignment-level total only; global gap is computable, item metrics are not",
      ],
    };
  }

  return baseline("no item detail and no assignment total to reconcile against");
}

export interface EvidenceCalibration {
  summary: CalibrationSummary;
  /** Null whenever the evidence is not perSkill-eligible. */
  perSkill: SkillCalibration[] | null;
}

export interface EvidenceAssessment {
  decision: EligibilityDecision;
  /** Null when the evidence is baseline-only. */
  calibration: EvidenceCalibration | null;
}

const EMPTY_BASE = {
  n: 0,
  brier: null,
  meanConfidence: null,
  accuracy: null,
  bias: null,
  discrimination: null,
} as const;

/**
 * Gate + compute in one deterministic step: decides eligibility and, when
 * eligible, runs the EXISTING calibration engine (never reimplemented here).
 * For "global" evidence the achieved fraction comes from the assignment total,
 * so globalGap is set while every item-level metric stays null.
 */
export function assessEvidence(input: EvidenceInput): EvidenceAssessment {
  const decision = decideEligibility(input);
  if (input.prediction === null || !decision.calibrationEligible) {
    return { decision, calibration: null };
  }

  if (decision.level === "global") {
    if (input.totals === null) {
      // Unreachable by construction (global requires totals); stay honest anyway.
      return { decision, calibration: null };
    }
    const achieved = input.totals.pointsAwarded / input.totals.maxPoints;
    const summary: CalibrationSummary = {
      ...EMPTY_BASE,
      globalGap: input.prediction.globalPredicted - achieved,
    };
    return { decision, calibration: { summary, perSkill: null } };
  }

  const summary = computeCalibration(input.prediction, input.outcome);
  const bySkill = decision.perSkillEligible
    ? perSkill(
        input.prediction,
        input.outcome,
        input.items.filter((item) => item.skillId !== UNTAGGED_SKILL_ID),
      )
    : null;
  return { decision, calibration: { summary, perSkill: bySkill } };
}
