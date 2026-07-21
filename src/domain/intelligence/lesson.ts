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
  /** The district (tenant) this lesson belongs to — the isolation boundary. */
  tenantId: Id;
  classId: Id;
  teacherId: Id;
  title: string;
  date: Date;
  lessonType: LessonType;
  /** The teacher's summary/notes/objectives text the AI reasons over. */
  content: string;
  objectives: string[];
  standards: string[];
  /**
   * An optional teacher-authored WORKED EXAMPLE — one correct way to do the core
   * task. When present, the reflection closes with an exemplar-grounded
   * self-comparison: the student attempts the skill from memory first (retrieval
   * practice), then compares against this correct exemplar (feedback against a
   * correct answer — the Kluger & DeNisi principle plumb is built on). This is
   * what turns the retrieval probe from "collect text" into feedback that teaches.
   */
  exemplar?: string;
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
  /** Passed through from the lesson: the teacher's worked example, if any (see Lesson.exemplar). */
  exemplar?: string;
  createdAt: Date;
}

export function createLesson(input: Lesson): Lesson {
  return Object.freeze(lessonSchema.parse(input));
}

export function createLessonAnalysis(input: LessonAnalysis): LessonAnalysis {
  return Object.freeze(lessonAnalysisSchema.parse(input));
}
