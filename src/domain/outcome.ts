import type { Id } from "./common";
import { itemOutcomeSchema, outcomeSchema } from "./schemas/academic";

/**
 * Outcome → the objective truth of an assessment: item-level correctness +
 * points. `scoredAt` is the moment the truth became known.
 */

export interface ItemOutcome {
  itemId: Id;
  correct: boolean;
  /** Points awarded; non-negative. */
  pointsAwarded: number;
}

export interface Outcome {
  id: Id;
  assessmentId: Id;
  studentId: Id;
  itemOutcomes: ItemOutcome[];
  scoredAt: Date;
}

export function createItemOutcome(input: ItemOutcome): ItemOutcome {
  return Object.freeze(itemOutcomeSchema.parse(input));
}

/** Rejects a negative `pointsAwarded` on any item. */
export function createOutcome(input: Outcome): Outcome {
  return Object.freeze(outcomeSchema.parse(input));
}
