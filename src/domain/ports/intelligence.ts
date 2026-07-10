import type { Lesson, LessonAnalysis } from "../intelligence/lesson";
import type { ReflectionQuestionSet } from "../intelligence/question";

/**
 * ReflectionIntelligence — the AI service seam for the reflection loop. It is
 * ASYNC by contract so an LLM-backed adapter drops in behind the same interface;
 * the deterministic adapter fulfils it with zero network so `pnpm check` and the
 * whole product run with no key (CLAUDE.md → "zero-LLM must work"). Every method
 * is labor: it drafts and structures. It never decides an intervention, computes
 * a gap, or sets a safety outcome — those stay in deterministic domain code.
 *
 * This first slice covers the teacher side (lesson → analysis → questions). The
 * adaptive student conversation and the student/class summaries land next, as
 * additional methods on this same port.
 */

export type ReflectionDepth = "shorter" | "standard" | "deeper";

export interface AnalyzeLessonInput {
  lesson: Lesson;
  gradeLevel?: string;
  subject?: string;
}

export interface GenerateQuestionsInput {
  analysis: LessonAnalysis;
  gradeLevel?: string;
  depth: ReflectionDepth;
  adaptiveFollowups: boolean;
}

export interface ReflectionIntelligence {
  /** Read a lesson: topic, likely misconceptions, emotional pressure points, focus. */
  analyzeLesson(input: AnalyzeLessonInput): Promise<LessonAnalysis>;
  /** Draft a short, balanced, lesson-specific reflection from an analysis. */
  generateReflectionQuestions(
    input: GenerateQuestionsInput,
  ): Promise<ReflectionQuestionSet>;
}
