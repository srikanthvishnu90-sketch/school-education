import { DomainError, type Id, type UnitInterval } from "./common";
import type { Outcome } from "./outcome";
import { itemPredictionSchema, predictionSchema } from "./schemas/academic";

/**
 * Prediction → metacognitive monitoring. A PRE-REGISTERED estimate captured
 * BEFORE the outcome is known: per-item confidence + a global predicted score.
 * The pre-registration is the whole point — it's what makes calibration honest,
 * so we enforce the ordering against the outcome as a hard invariant.
 */

export interface ItemPrediction {
  itemId: Id;
  /** Confidence in [0, 1]. */
  confidence: UnitInterval;
}

export interface Prediction {
  id: Id;
  assessmentId: Id;
  studentId: Id;
  itemPredictions: ItemPrediction[];
  /** Predicted overall score in [0, 1]. */
  globalPredicted: UnitInterval;
  createdAt: Date;
}

export function createItemPrediction(input: ItemPrediction): ItemPrediction {
  return Object.freeze(itemPredictionSchema.parse(input));
}

/** Rejects any confidence or globalPredicted outside [0, 1]. */
export function createPrediction(input: Prediction): Prediction {
  return Object.freeze(predictionSchema.parse(input));
}

/**
 * Invariant: you cannot predict after seeing the result. Throws unless the
 * prediction was created strictly before the outcome was scored.
 */
export function assertPredictionPrecedesOutcome(
  prediction: Prediction,
  outcome: Outcome,
): void {
  if (prediction.createdAt.getTime() >= outcome.scoredAt.getTime()) {
    throw new DomainError(
      "prediction.createdAt must be strictly before outcome.scoredAt " +
        "(a prediction cannot be made after the result is known)",
    );
  }
}
