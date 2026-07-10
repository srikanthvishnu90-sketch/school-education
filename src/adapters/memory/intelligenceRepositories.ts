import type { Id } from "@/domain/common";
import type { Lesson } from "@/domain/intelligence/lesson";
import type { ReflectionQuestionSet } from "@/domain/intelligence/question";
import type { ReflectionSession } from "@/domain/intelligence/session";
import type {
  ClassInsightSummary,
  StudentInsightSummary,
} from "@/domain/intelligence/insight";
import type { ReflectionPerformance } from "@/domain/intelligence/metacognition";
import type {
  ClassSummaryRepository,
  LessonRepository,
  PerformanceRepository,
  QuestionSetRepository,
  ReflectionSessionRepository,
  StudentSummaryRepository,
} from "@/domain/ports/intelligenceRepositories";

/**
 * In-memory adapters for the reflection-intelligence entities — Map-backed,
 * insertion-ordered, `save` overwrites by key. They implement the ports exactly;
 * a Supabase adapter can replace them without touching the application.
 */

export function createMemoryLessonRepository(): LessonRepository {
  const byId = new Map<Id, Lesson>();
  return {
    async save(lesson) {
      byId.set(lesson.id, lesson);
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async listByClass(classId) {
      return [...byId.values()].filter((l) => l.classId === classId);
    },
  };
}

export function createMemoryQuestionSetRepository(): QuestionSetRepository {
  const byLesson = new Map<Id, ReflectionQuestionSet>();
  return {
    async save(set) {
      byLesson.set(set.lessonId, set);
    },
    async findByLesson(lessonId) {
      return byLesson.get(lessonId) ?? null;
    },
  };
}

export function createMemoryReflectionSessionRepository(): ReflectionSessionRepository {
  const byId = new Map<Id, ReflectionSession>();
  return {
    async save(session) {
      byId.set(session.id, session);
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findByReflectionAndStudent(reflectionId, studentId) {
      return (
        [...byId.values()].find(
          (s) => s.reflectionId === reflectionId && s.studentId === studentId,
        ) ?? null
      );
    },
    async listByStudent(studentId) {
      return [...byId.values()].filter((s) => s.studentId === studentId);
    },
    async listByReflection(reflectionId) {
      return [...byId.values()].filter((s) => s.reflectionId === reflectionId);
    },
  };
}

export function createMemoryStudentSummaryRepository(): StudentSummaryRepository {
  const byId = new Map<Id, StudentInsightSummary>();
  return {
    async save(summary) {
      byId.set(summary.id, summary);
    },
    async findByReflectionAndStudent(reflectionId, studentId) {
      return (
        [...byId.values()].find(
          (s) => s.reflectionId === reflectionId && s.studentId === studentId,
        ) ?? null
      );
    },
    async listByStudent(studentId) {
      return [...byId.values()].filter((s) => s.studentId === studentId);
    },
    async listByReflection(reflectionId) {
      return [...byId.values()].filter((s) => s.reflectionId === reflectionId);
    },
  };
}

export function createMemoryClassSummaryRepository(): ClassSummaryRepository {
  const byReflection = new Map<Id, ClassInsightSummary>();
  return {
    async save(summary) {
      byReflection.set(summary.reflectionId, summary);
    },
    async findByReflection(reflectionId) {
      return byReflection.get(reflectionId) ?? null;
    },
  };
}

export function createMemoryPerformanceRepository(): PerformanceRepository {
  const byKey = new Map<string, ReflectionPerformance>();
  const key = (reflectionId: Id, studentId: Id): string =>
    `${reflectionId}::${studentId}`;
  return {
    async save(performance) {
      byKey.set(key(performance.reflectionId, performance.studentId), performance);
    },
    async findByReflectionAndStudent(reflectionId, studentId) {
      return byKey.get(key(reflectionId, studentId)) ?? null;
    },
    async listByStudent(studentId) {
      return [...byKey.values()].filter((p) => p.studentId === studentId);
    },
  };
}
