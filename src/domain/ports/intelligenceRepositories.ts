import type { Id } from "../common";
import type { Lesson } from "../intelligence/lesson";
import type { ReflectionQuestionSet } from "../intelligence/question";
import type { ReflectionSession } from "../intelligence/session";
import type {
  ClassInsightSummary,
  StudentInsightSummary,
} from "../intelligence/insight";
import type { ReflectionPerformance } from "../intelligence/metacognition";

/**
 * Persistence ports for the reflection-intelligence subsystem. Pure interfaces,
 * async, matching the existing repository style. In the MVP a lesson has exactly
 * one reflection, so a session's/summary's `reflectionId` is the lesson id — the
 * question set is stored keyed by lesson.
 */

export interface LessonRepository {
  save(lesson: Lesson): Promise<void>;
  findById(id: Id): Promise<Lesson | null>;
  listByClass(classId: Id): Promise<Lesson[]>;
}

export interface QuestionSetRepository {
  save(set: ReflectionQuestionSet): Promise<void>;
  findByLesson(lessonId: Id): Promise<ReflectionQuestionSet | null>;
}

export interface ReflectionSessionRepository {
  save(session: ReflectionSession): Promise<void>;
  findById(id: Id): Promise<ReflectionSession | null>;
  findByReflectionAndStudent(
    reflectionId: Id,
    studentId: Id,
  ): Promise<ReflectionSession | null>;
  listByStudent(studentId: Id): Promise<ReflectionSession[]>;
  listByReflection(reflectionId: Id): Promise<ReflectionSession[]>;
}

export interface StudentSummaryRepository {
  save(summary: StudentInsightSummary): Promise<void>;
  findByReflectionAndStudent(
    reflectionId: Id,
    studentId: Id,
  ): Promise<StudentInsightSummary | null>;
  listByStudent(studentId: Id): Promise<StudentInsightSummary[]>;
  listByReflection(reflectionId: Id): Promise<StudentInsightSummary[]>;
}

export interface ClassSummaryRepository {
  save(summary: ClassInsightSummary): Promise<void>;
  findByReflection(reflectionId: Id): Promise<ClassInsightSummary | null>;
}

/**
 * The teacher-entered graded result behind a reflection (P7 score entry). Keyed
 * by (reflectionId, studentId) — one performance per student per reflection.
 */
export interface PerformanceRepository {
  save(performance: ReflectionPerformance): Promise<void>;
  findByReflectionAndStudent(
    reflectionId: Id,
    studentId: Id,
  ): Promise<ReflectionPerformance | null>;
  listByStudent(studentId: Id): Promise<ReflectionPerformance[]>;
}
