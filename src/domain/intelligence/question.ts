import { DomainError, type Id } from "../common";
import {
  generatedQuestionSchema,
  reflectionQuestionSetSchema,
} from "../schemas/intelligence";

/**
 * The AI-generated reflection: a short, balanced set of lesson-specific questions
 * plus adaptive follow-up rules. Two product principles are HARD INVARIANTS here,
 * not decoration (spec → Product principles):
 *  - "Connect emotion to learning": a set must probe BOTH technical understanding
 *    AND emotional experience — never emotions without academic context.
 *  - Keep it short: 4–6 primary questions (≈2–5 minutes), not a survey.
 */

export type QuestionCategory =
  | "technical"
  | "emotional"
  | "behavioral"
  | "metacognitive";

export type QuestionFormat =
  | "multiple_choice"
  | "rating"
  | "short_response"
  | "long_response"
  | "emotion_select"
  | "confidence_slider"
  | "multi_select"
  | "open";

export interface GeneratedQuestion {
  id: Id;
  category: QuestionCategory;
  text: string;
  format: QuestionFormat;
  /** Required for closed formats; ignored for free-text ones. */
  options?: string[];
  order: number;
  required: boolean;
  aiGenerated: boolean;
}

export interface ReflectionQuestionSet {
  lessonId: Id;
  questions: GeneratedQuestion[];
  adaptiveFollowupsEnabled: boolean;
  /** Cap on adaptive follow-ups (spec → default max 4). */
  maxFollowups: number;
  createdAt: Date;
  /**
   * When a teacher approved these AI-drafted questions for students. `null` = a
   * draft awaiting review. AI output NEVER reaches a student until a person sets
   * this. A person owns the decision — the model only labors (drafts).
   */
  approvedAt: Date | null;
}

export const MIN_PRIMARY_QUESTIONS = 4;
export const MAX_PRIMARY_QUESTIONS = 6;

const FORMATS_NEEDING_OPTIONS: readonly QuestionFormat[] = [
  "multiple_choice",
  "multi_select",
];

/** A set is balanced iff it probes technical AND emotional and is 4–6 long. */
export function isBalancedQuestionSet(set: ReflectionQuestionSet): boolean {
  const categories = new Set(set.questions.map((q) => q.category));
  return (
    categories.has("technical") &&
    categories.has("emotional") &&
    set.questions.length >= MIN_PRIMARY_QUESTIONS &&
    set.questions.length <= MAX_PRIMARY_QUESTIONS
  );
}

export function createGeneratedQuestion(input: GeneratedQuestion): GeneratedQuestion {
  const parsed = generatedQuestionSchema.parse(input);
  if (
    FORMATS_NEEDING_OPTIONS.includes(parsed.format) &&
    (parsed.options === undefined || parsed.options.length === 0)
  ) {
    throw new DomainError(
      `a ${parsed.format} question must provide answer options`,
    );
  }
  return Object.freeze(parsed);
}

/**
 * Rejects an unbalanced or wrongly-sized set — the emotion/academic pairing is a
 * product guarantee, so the type cannot be constructed without it.
 */
export function createReflectionQuestionSet(
  input: ReflectionQuestionSet,
): ReflectionQuestionSet {
  const parsed = reflectionQuestionSetSchema.parse(input);
  parsed.questions.forEach((q) => createGeneratedQuestion(q));
  if (!isBalancedQuestionSet(parsed)) {
    throw new DomainError(
      "a reflection must include at least one technical AND one emotional " +
        `question, with ${MIN_PRIMARY_QUESTIONS}–${MAX_PRIMARY_QUESTIONS} primary questions ` +
        "(product principle: connect emotion to learning, keep it short)",
    );
  }
  return Object.freeze(parsed);
}

/** True once a teacher has approved the draft for students. The student gate. */
export function isQuestionSetApproved(set: ReflectionQuestionSet): boolean {
  return set.approvedAt !== null;
}

/**
 * A teacher approves the AI-drafted set, stamping the moment a person owned the
 * decision. Returns a new frozen set; does not mutate. Idempotent — re-approving
 * keeps the original approval time (the first human gate is the one that counts).
 */
export function approveQuestionSet(
  set: ReflectionQuestionSet,
  at: Date,
): ReflectionQuestionSet {
  if (set.approvedAt !== null) return set;
  return createReflectionQuestionSet({ ...set, approvedAt: at });
}
