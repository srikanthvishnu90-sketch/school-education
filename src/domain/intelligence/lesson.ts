import { type Id } from "../common";
import { lessonAnalysisSchema, lessonSchema } from "../schemas/intelligence";

/**
 * The Lesson is the product's main entry point: a teacher enters or uploads what
 * happened in class, and everything downstream (analysis → questions → student
 * reflection → summaries) hangs off it. Only title/class/date/content are
 * required; every richer field is optional context (spec → Teacher lesson input).
 */

export type LessonType =
  | "direct_instruction"
  | "discussion"
  | "group_work"
  | "independent_practice"
  | "lab"
  | "presentation"
  | "project"
  | "review"
  | "assessment_prep"
  | "other";

export interface Lesson {
  id: Id;
  classId: Id;
  teacherId: Id;
  title: string;
  date: Date;
  lessonType: LessonType;
  /** The teacher's summary/notes/objectives text the AI reasons over. */
  content: string;
  objectives: string[];
  standards: string[];
  createdAt: Date;
}

/**
 * What the AI reads OUT of a lesson before any questions are written. This is
 * DRAFTING labor (CLAUDE.md → "AI = labor, not judgment"): it surfaces likely
 * technical difficulty and emotional pressure points so questions can be
 * lesson-specific. It never decides an intervention or a student's state.
 */
export interface LessonAnalysis {
  lessonId: Id;
  topic: string;
  subtopics: string[];
  objectives: string[];
  vocabulary: string[];
  prerequisites: string[];
  technicalSteps: string[];
  misconceptions: string[];
  difficultTransitions: string[];
  /** Where students must apply the concept without a worked example in front of them. */
  independentApplication: string[];
  /** Moments a student may feel confused, rushed, or hesitant to participate. */
  emotionalPressurePoints: string[];
  /** One-line steer for the question generator (e.g. "independent application, response to mistakes"). */
  reflectionFocus: string;
  createdAt: Date;
}

export function createLesson(input: Lesson): Lesson {
  return Object.freeze(lessonSchema.parse(input));
}

export function createLessonAnalysis(input: LessonAnalysis): LessonAnalysis {
  return Object.freeze(lessonAnalysisSchema.parse(input));
}
