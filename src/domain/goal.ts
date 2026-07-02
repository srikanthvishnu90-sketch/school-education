import type { Id, UnitInterval } from "./common";
import { learningGoalSchema } from "./schemas/academic";

/**
 * LearningGoal → SDT autonomy + Hattie feed-up ("Why does this matter?").
 * The student sets their OWN reason (`whyItMatters`) and their OWN target
 * (`targetScore`). Congruence is later measured *against this goal*, never
 * against an institution-imposed bar (CLAUDE.md → Congruence is goal-referenced).
 */
export interface LearningGoal {
  id: Id;
  studentId: Id;
  assessmentId: Id;
  /** Student-set target in [0, 1]. */
  targetScore: UnitInterval;
  whyItMatters: string;
  successCriteriaRef?: string;
  createdAt: Date;
}

/** Rejects a target outside [0, 1] or an empty reason. */
export function createLearningGoal(input: LearningGoal): LearningGoal {
  return Object.freeze(learningGoalSchema.parse(input));
}
