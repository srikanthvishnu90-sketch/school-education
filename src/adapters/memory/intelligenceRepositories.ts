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
  CalibrationRecord,
  Evidence,
  SkillTag,
} from "@/domain/intelligence/calibrationModel";
import type { ProbeAttempt } from "@/domain/intelligence/probeAttempt";
import type {
  CalibrationRecordRepository,
  ClassSummaryRepository,
  EvidenceRepository,
  LessonRepository,
  PerformanceRepository,
  ProbeAttemptRepository,
  QuestionSetRepository,
  ReflectionSessionRepository,
  SkillTagRepository,
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
    async delete(id) {
      byId.delete(id);
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
    async deleteByLesson(lessonId) {
      byLesson.delete(lessonId);
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
    async deleteByStudent(studentId) {
      let n = 0;
      for (const [id, s] of byId) {
        if (s.studentId === studentId) {
          byId.delete(id);
          n += 1;
        }
      }
      return n;
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
    async deleteByStudent(studentId) {
      let n = 0;
      for (const [id, s] of byId) {
        if (s.studentId === studentId) {
          byId.delete(id);
          n += 1;
        }
      }
      return n;
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
    async deleteByStudent(studentId) {
      let n = 0;
      for (const [k, p] of byKey) {
        if (p.studentId === studentId) {
          byKey.delete(k);
          n += 1;
        }
      }
      return n;
    },
  };
}

export function createMemorySkillTagRepository(): SkillTagRepository {
  const byId = new Map<Id, SkillTag>();
  return {
    async save(skill) {
      byId.set(skill.id, skill);
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async listByClass(classId) {
      return [...byId.values()].filter((s) => s.classId === classId);
    },
  };
}

export function createMemoryEvidenceRepository(): EvidenceRepository {
  const byId = new Map<Id, Evidence>();
  return {
    async save(evidence) {
      byId.set(evidence.id, evidence);
    },
    async listByStudentAndLesson(studentId, lessonId) {
      return [...byId.values()].filter(
        (e) => e.studentId === studentId && e.lessonId === lessonId,
      );
    },
    async listByStudent(studentId) {
      return [...byId.values()].filter((e) => e.studentId === studentId);
    },
    async deleteByStudent(studentId) {
      let n = 0;
      for (const [id, e] of byId) {
        if (e.studentId === studentId) {
          byId.delete(id);
          n += 1;
        }
      }
      return n;
    },
  };
}

export function createMemoryCalibrationRecordRepository(): CalibrationRecordRepository {
  const byId = new Map<Id, CalibrationRecord>();
  return {
    async save(record) {
      byId.set(record.id, record);
    },
    async listByStudent(studentId) {
      return [...byId.values()].filter((c) => c.studentId === studentId);
    },
    async listByStudentAndSkill(studentId, skillId) {
      return [...byId.values()].filter(
        (c) => c.studentId === studentId && c.skillId === skillId,
      );
    },
    async deleteByStudent(studentId) {
      let n = 0;
      for (const [id, c] of byId) {
        if (c.studentId === studentId) {
          byId.delete(id);
          n += 1;
        }
      }
      return n;
    },
  };
}

export function createMemoryProbeAttemptRepository(): ProbeAttemptRepository {
  const byId = new Map<Id, ProbeAttempt>();
  return {
    async save(attempt) {
      byId.set(attempt.id, attempt);
    },
    async listByStudent(studentId) {
      return [...byId.values()].filter((a) => a.studentId === studentId);
    },
    async listByReflectionAndStudent(reflectionId, studentId) {
      return [...byId.values()].filter(
        (a) => a.reflectionId === reflectionId && a.studentId === studentId,
      );
    },
    async deleteByStudent(studentId) {
      let n = 0;
      for (const [id, a] of byId) {
        if (a.studentId === studentId) {
          byId.delete(id);
          n += 1;
        }
      }
      return n;
    },
  };
}
