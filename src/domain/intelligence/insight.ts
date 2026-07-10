import { DomainError, type Id } from "../common";
import {
  classInsightSummarySchema,
  studentInsightSummarySchema,
} from "../schemas/intelligence";
import { assertNonDiagnostic } from "./nonDiagnostic";

/**
 * The teacher-facing product of a reflection. Two product principles are HARD
 * INVARIANTS here (spec → Make every insight actionable; Do not diagnose):
 *  - Actionable: a student summary must carry ≥1 piece of evidence AND ≥1
 *    recommended action. Insight with nothing to do is rejected.
 *  - Non-diagnostic: every author-written sentence must pass the guard before the
 *    summary can be constructed — a diagnosis can never reach a teacher.
 */

export type ConfidenceLevel = "high" | "moderate" | "limited";

export type AttentionGroup =
  | "low_understanding_low_confidence"
  | "high_understanding_low_confidence"
  | "low_understanding_high_confidence"
  | "significant_emotional_change"
  | "reflection_assessment_mismatch"
  | "repeated_help_avoidance"
  | "positive_improvement";

export interface AttentionStudent {
  studentId: Id;
  group: AttentionGroup;
}

export interface StudentInsightSummary {
  id: Id;
  studentId: Id;
  reflectionId: Id;
  technicalSummary: string;
  emotionalSummary: string;
  behavioralSummary: string;
  /** One sentence connecting the technical, emotional, and behavioral signals. */
  relationshipSummary: string;
  recommendedActions: string[];
  /** The short, growth-framed summary the student sees and can correct. */
  studentFacingSummary: string;
  /** Lesson responses / trends the interpretation rests on (fact vs inference). */
  evidence: string[];
  confidenceLevel: ConfidenceLevel;
  createdAt: Date;
}

export interface ClassInsightSummary {
  id: Id;
  classId: Id;
  reflectionId: Id;
  technicalSummary: string;
  emotionalSummary: string;
  behavioralSummary: string;
  keyRelationship: string;
  recommendedPlan: string[];
  attentionStudents: AttentionStudent[];
  createdAt: Date;
}

const MAX_PLAN_STEPS = 5;

export function createStudentInsightSummary(
  input: StudentInsightSummary,
): StudentInsightSummary {
  const parsed = studentInsightSummarySchema.parse(input);
  if (parsed.evidence.length === 0 || parsed.recommendedActions.length === 0) {
    throw new DomainError(
      "a student summary must carry at least one piece of evidence and one " +
        "recommended action (product principle: make every insight actionable)",
    );
  }
  [
    parsed.technicalSummary,
    parsed.emotionalSummary,
    parsed.behavioralSummary,
    parsed.relationshipSummary,
    parsed.studentFacingSummary,
    ...parsed.recommendedActions,
  ].forEach(assertNonDiagnostic);
  return Object.freeze(parsed);
}

export function createClassInsightSummary(
  input: ClassInsightSummary,
): ClassInsightSummary {
  const parsed = classInsightSummarySchema.parse(input);
  if (parsed.recommendedPlan.length === 0 || parsed.recommendedPlan.length > MAX_PLAN_STEPS) {
    throw new DomainError(
      `a class plan must have 1–${MAX_PLAN_STEPS} steps (spec → 3–5 concise actions)`,
    );
  }
  [
    parsed.technicalSummary,
    parsed.emotionalSummary,
    parsed.behavioralSummary,
    parsed.keyRelationship,
    ...parsed.recommendedPlan,
  ].forEach(assertNonDiagnostic);
  return Object.freeze(parsed);
}
