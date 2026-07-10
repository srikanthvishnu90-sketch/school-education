import type { Id } from "@/domain/common";
import type { Assessment } from "@/domain/skill";
import type { LearningGoal } from "@/domain/goal";
import type { Outcome } from "@/domain/outcome";
import type { Reflection } from "@/domain/reflection";
import type { ConsentRecord, DeletionReceipt } from "@/domain/consent";
import type { FlagAcknowledgement } from "@/domain/flag";
import type { TransferProbe } from "@/domain/transferProbe";
import type { LearningMap } from "@/domain/learningMap";
import type { AffectSnapshot, EmotionVocabulary } from "@/domain/emotion";
import { createHash } from "node:crypto";
import type { PilotEvent } from "@/domain/pilot";
import type {
  AffectRepository,
  AssessmentRepository,
  ConsentRepository,
  EmotionVocabularyRepository,
  FlagAcknowledgementRepository,
  GoalRepository,
  LearningMapRepository,
  OutcomeRepository,
  PilotEventRepository,
  PseudonymRepository,
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

  deleteWhere(predicate: (entity: E) => boolean): number {
    let count = 0;
    for (const [id, entity] of this.byId) {
      if (predicate(entity)) {
        this.byId.delete(id);
        count += 1;
      }
    }
    return count;
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

export function createPilotEventRepository(): PilotEventRepository {
  const events: PilotEvent[] = [];
  return {
    async append(event) {
      events.push(event);
    },
    async list() {
      return [...events];
    },
    async listByTenant(tenantId) {
      return events.filter((e) => e.tenantId === tenantId);
    },
  };
}

/**
 * The pseudonymization table. A pseudonym is a salted hash of the real id — stable
 * (same real id → same pseudonym) and non-reversible without this table, which is
 * the only place the mapping is retained.
 */
export function createPseudonymRepository(
  salt = "plumb-pilot",
): PseudonymRepository {
  const forward = new Map<string, string>();
  return {
    async resolve(realStudentId) {
      const existing = forward.get(realStudentId);
      if (existing !== undefined) return existing;
      const pseudonym = createHash("sha256")
        .update(`${salt}:${realStudentId}`, "utf8")
        .digest("hex")
        .slice(0, 16);
      forward.set(realStudentId, pseudonym);
      return pseudonym;
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
    async deleteByStudent(studentId) {
      return store.deleteWhere((a) => a.studentId === studentId);
    },
  };
}

export function createConsentRepository(): ConsentRepository {
  const records = new MemoryStore<ConsentRecord>();
  const receipts = new MemoryStore<DeletionReceipt>();
  return {
    async save(record) {
      records.set(record.id, record);
    },
    async listByStudent(studentId) {
      return records.values().filter((r) => r.studentId === studentId);
    },
    async recordDeletion(receipt) {
      receipts.set(receipt.id, receipt);
    },
    async listReceipts(studentId) {
      return receipts.values().filter((r) => r.studentId === studentId);
    },
  };
}

export function createFlagAcknowledgementRepository(): FlagAcknowledgementRepository {
  const store = new MemoryStore<FlagAcknowledgement>();
  return {
    async save(ack) {
      store.set(ack.flagId, ack);
    },
    async find(flagId) {
      return store.get(flagId);
    },
    async list() {
      return store.values();
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
