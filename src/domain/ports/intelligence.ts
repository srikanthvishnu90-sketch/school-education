import type { Id } from "../common";
import type { Lesson, LessonAnalysis } from "../intelligence/lesson";
import type {
  QuestionCategory,
  QuestionFormat,
  ReflectionQuestionSet,
} from "../intelligence/question";
import type { ReflectionSession, ReflectionStage } from "../intelligence/session";
import type { ExtractedSignals } from "../intelligence/signals";
import type {
  ClassInsightSummary,
  StudentInsightSummary,
} from "../intelligence/insight";

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
  /**
   * Optional photos of the day's work (board, anchor chart, student work) as data
   * URLs. A vision-capable adapter grounds its analysis in what they show; the
   * deterministic adapter ignores them.
   */
  photos?: readonly string[];
}

export interface GenerateQuestionsInput {
  analysis: LessonAnalysis;
  gradeLevel?: string;
  depth: ReflectionDepth;
  adaptiveFollowups: boolean;
}

export interface NextTurnInput {
  session: ReflectionSession;
  questionSet: ReflectionQuestionSet;
}

/**
 * The next move in the adaptive conversation. `question` asks one thing; `summary`
 * means enough is known to end and summarize; `safety` means a possible safety
 * concern surfaced and the normal reflection must stop. Safety is decided by
 * deterministic detection, NEVER by the model (CLAUDE.md → AI never sets a safety
 * outcome).
 */
export type ConversationStep =
  | {
      kind: "question";
      stage: ReflectionStage;
      category: QuestionCategory;
      text: string;
      format: QuestionFormat;
      /** Optional prompts expose a neutral skip path in the student chat. */
      required: boolean;
      options?: string[];
    }
  | { kind: "summary" }
  | { kind: "safety" };

export interface ExtractSignalsInput {
  session: ReflectionSession;
  analysis?: LessonAnalysis;
}

export interface SummarizeStudentInput {
  session: ReflectionSession;
  signals: ExtractedSignals;
  analysis?: LessonAnalysis;
}

export interface ClassStudentInput {
  studentId: Id;
  summary: StudentInsightSummary;
  signals: ExtractedSignals;
}

export interface SummarizeClassInput {
  classId: Id;
  reflectionId: Id;
  students: ClassStudentInput[];
}

export interface ReflectionIntelligence {
  /** Read a lesson: topic, likely misconceptions, emotional pressure points, focus. */
  analyzeLesson(input: AnalyzeLessonInput): Promise<LessonAnalysis>;
  /** Draft a short, balanced, lesson-specific reflection from an analysis. */
  generateReflectionQuestions(
    input: GenerateQuestionsInput,
  ): Promise<ReflectionQuestionSet>;
  /** Decide the next conversational move given the session so far. */
  nextTurn(input: NextTurnInput): Promise<ConversationStep>;
  /** Tag the conversation onto the closed technical/emotional/behavioral/context sets. */
  extractSignals(input: ExtractSignalsInput): Promise<ExtractedSignals>;
  /** Build the teacher + student summary for one reflection (evidence + confidence). */
  summarizeStudentReflection(
    input: SummarizeStudentInput,
  ): Promise<StudentInsightSummary>;
  /** Aggregate student summaries into a class brief with attention groups + a plan. */
  summarizeClassReflection(
    input: SummarizeClassInput,
  ): Promise<ClassInsightSummary>;
}
