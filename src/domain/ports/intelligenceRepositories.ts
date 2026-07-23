import type { Id } from "../common";
import type { Lesson } from "../intelligence/lesson";
import type { ReflectionQuestionSet } from "../intelligence/question";
import type { ReflectionSession } from "../intelligence/session";
import type {
  ClassInsightSummary,
  StudentInsightSummary,
} from "../intelligence/insight";
import type { ReflectionPerformance } from "../intelligence/metacognition";
import type {
  CalibrationRecord,
  Evidence,
  SkillTag,
} from "../intelligence/calibrationModel";
import type { ProbeAttempt } from "../intelligence/probeAttempt";

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
  /** Remove a lesson (teacher delete). No-op if it doesn't exist. */
  delete(id: Id): Promise<void>;
}

export interface QuestionSetRepository {
  save(set: ReflectionQuestionSet): Promise<void>;
  findByLesson(lessonId: Id): Promise<ReflectionQuestionSet | null>;
  /** Remove the question set for a lesson (teacher delete). No-op if absent. */
  deleteByLesson(lessonId: Id): Promise<void>;
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
  /** Hard-delete every session for a student (right-to-erasure). Returns the count. */
  deleteByStudent(studentId: Id): Promise<number>;
}

export interface StudentSummaryRepository {
  save(summary: StudentInsightSummary): Promise<void>;
  findByReflectionAndStudent(
    reflectionId: Id,
    studentId: Id,
  ): Promise<StudentInsightSummary | null>;
  listByStudent(studentId: Id): Promise<StudentInsightSummary[]>;
  listByReflection(reflectionId: Id): Promise<StudentInsightSummary[]>;
  /** Hard-delete every summary for a student (right-to-erasure). Returns the count. */
  deleteByStudent(studentId: Id): Promise<number>;
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
  /** Hard-delete every performance for a student (right-to-erasure). Returns the count. */
  deleteByStudent(studentId: Id): Promise<number>;
}

/**
 * The skill-tag layer of the calibration model (calibrationModel.ts, brief §2).
 * Each entity below carries its own `id`, so — like Lesson/Session/StudentSummary,
 * and unlike the id-less ReflectionPerformance — `save` is an upsert keyed by that
 * `id`. The list queries index the owner columns each read filters on.
 */

export interface SkillTagRepository {
  save(skill: SkillTag): Promise<void>;
  findById(id: Id): Promise<SkillTag | null>;
  listByClass(classId: Id): Promise<SkillTag[]>;
}

export interface EvidenceRepository {
  save(evidence: Evidence): Promise<void>;
  listByStudentAndLesson(studentId: Id, lessonId: Id): Promise<Evidence[]>;
  listByStudent(studentId: Id): Promise<Evidence[]>;
  /** Hard-delete every evidence row for a student (right-to-erasure). Returns the count. */
  deleteByStudent(studentId: Id): Promise<number>;
}

export interface CalibrationRecordRepository {
  save(record: CalibrationRecord): Promise<void>;
  listByStudent(studentId: Id): Promise<CalibrationRecord[]>;
  listByStudentAndSkill(studentId: Id, skillId: Id): Promise<CalibrationRecord[]>;
  /** Hard-delete every calibration record for a student (right-to-erasure). Returns the count. */
  deleteByStudent(studentId: Id): Promise<number>;
}

/**
 * STUDENT-owned, self-scored transfer-probe attempts (probeAttempt.ts). Keyed by
 * `id`, so `save` is an upsert. Reads are scoped to the owning student — this data
 * is never on a teacher/admin read path — and it is erasable like the sibling repos.
 */
export interface ProbeAttemptRepository {
  save(attempt: ProbeAttempt): Promise<void>;
  listByStudent(studentId: Id): Promise<ProbeAttempt[]>;
  listByReflectionAndStudent(
    reflectionId: Id,
    studentId: Id,
  ): Promise<ProbeAttempt[]>;
  /** Hard-delete every probe attempt for a student (right-to-erasure). Returns the count. */
  deleteByStudent(studentId: Id): Promise<number>;
}
