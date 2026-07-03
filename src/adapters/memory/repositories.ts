import type { Id } from "@/domain/common";
import type { Assessment } from "@/domain/skill";
import type { LearningGoal } from "@/domain/goal";
import type { Prediction } from "@/domain/prediction";
import type { Outcome } from "@/domain/outcome";
import type { Reflection } from "@/domain/reflection";
import type { CalibrationRecord } from "@/domain/calibration";
import type { ActionVerification } from "@/domain/verification";
import type { TransferProbe } from "@/domain/transferProbe";
import type { LearningMap } from "@/domain/learningMap";
import type { AffectSnapshot, EmotionVocabulary } from "@/domain/emotion";
import type {
  AffectRepository,
  ActionVerificationRepository,
  AssessmentRepository,
  CalibrationRepository,
  EmotionVocabularyRepository,
  GoalRepository,
  LearningMapRepository,
  OutcomeRepository,
  PredictionRepository,
  ReflectionRepository,
  TransferProbeRepository,
} from "@/domain/ports";

/**
 * In-memory adapters — the only infrastructure that exists (CLAUDE.md). Backed by
 * `Map`, which preserves insertion order, so every `listBy*` is deterministic.
 * `save` overwrites by id in place. These implement the domain port interfaces
 * exactly; nothing here leaks back into the domain.
 */

/** Insertion-ordered id → entity store shared by the id-keyed repositories. */
class MemoryStore<E> {
  private readonly byId = new Map<Id, E>();

  set(id: Id, entity: E): void {
    this.byId.set(id, entity);
  }

  get(id: Id): E | null {
    return this.byId.get(id) ?? null;
  }

  values(): E[] {
    return [...this.byId.values()];
  }
}

export function createAssessmentRepository(): AssessmentRepository {
  const store = new MemoryStore<Assessment>();
  return {
    async save(assessment) {
      store.set(assessment.id, assessment);
    },
    async findById(id) {
      return store.get(id);
    },
  };
}

export function createGoalRepository(): GoalRepository {
  const store = new MemoryStore<LearningGoal>();
  return {
    async save(goal) {
      store.set(goal.id, goal);
    },
    async findById(id) {
      return store.get(id);
    },
    async listByStudent(studentId) {
      return store.values().filter((g) => g.studentId === studentId);
    },
  };
}

export function createPredictionRepository(): PredictionRepository {
  const store = new MemoryStore<Prediction>();
  return {
    async save(prediction) {
      store.set(prediction.id, prediction);
    },
    async findById(id) {
      return store.get(id);
    },
    async findByAssessmentAndStudent(assessmentId, studentId) {
      return (
        store
          .values()
          .filter(
            (p) => p.assessmentId === assessmentId && p.studentId === studentId,
          )
          .at(-1) ?? null
      );
    },
  };
}

export function createOutcomeRepository(): OutcomeRepository {
  const store = new MemoryStore<Outcome>();
  return {
    async save(outcome) {
      store.set(outcome.id, outcome);
    },
    async findById(id) {
      return store.get(id);
    },
    async findByAssessmentAndStudent(assessmentId, studentId) {
      return (
        store
          .values()
          .filter(
            (o) => o.assessmentId === assessmentId && o.studentId === studentId,
          )
          .at(-1) ?? null
      );
    },
  };
}

export function createReflectionRepository(): ReflectionRepository {
  const store = new MemoryStore<Reflection>();
  return {
    async save(reflection) {
      store.set(reflection.id, reflection);
    },
    async findById(id) {
      return store.get(id);
    },
    async listByStudent(studentId) {
      return store.values().filter((r) => r.studentId === studentId);
    },
  };
}

export function createCalibrationRepository(): CalibrationRepository {
  const store = new MemoryStore<CalibrationRecord>();
  return {
    async save(record) {
      store.set(record.id, record);
    },
    async findById(id) {
      return store.get(id);
    },
    async listByStudent(studentId) {
      return store.values().filter((c) => c.studentId === studentId);
    },
  };
}

export function createTransferProbeRepository(): TransferProbeRepository {
  const store = new MemoryStore<TransferProbe>();
  return {
    async save(probe) {
      store.set(probe.id, probe);
    },
    async findById(id) {
      return store.get(id);
    },
  };
}

export function createActionVerificationRepository(): ActionVerificationRepository {
  const store = new MemoryStore<ActionVerification>();
  return {
    async save(verification) {
      store.set(verification.id, verification);
    },
    async findById(id) {
      return store.get(id);
    },
    async listByStudent(studentId) {
      return store.values().filter((v) => v.studentId === studentId);
    },
  };
}

export function createLearningMapRepository(): LearningMapRepository {
  const store = new MemoryStore<LearningMap>();
  return {
    async save(map) {
      store.set(map.id, map);
    },
    async findBySkill(skillId) {
      return store.values().find((m) => m.skillId === skillId) ?? null;
    },
  };
}

export function createAffectRepository(): AffectRepository {
  const store = new MemoryStore<AffectSnapshot>();
  return {
    async save(snapshot) {
      store.set(snapshot.id, snapshot);
    },
    async findById(id) {
      return store.get(id);
    },
    async listByAssessmentAndStudent(assessmentId, studentId) {
      return store
        .values()
        .filter(
          (a) => a.assessmentId === assessmentId && a.studentId === studentId,
        );
    },
    async listByStudent(studentId) {
      return store.values().filter((a) => a.studentId === studentId);
    },
  };
}

export function createEmotionVocabularyRepository(): EmotionVocabularyRepository {
  let current: EmotionVocabulary | null = null;
  return {
    async find() {
      return current;
    },
    async save(vocabulary) {
      current = vocabulary;
    },
  };
}
