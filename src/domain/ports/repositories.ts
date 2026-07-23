import type { Id } from "../common";
import type { Assessment } from "../skill";
import type { LearningGoal } from "../goal";
import type { Outcome } from "../outcome";
import type { Reflection } from "../reflection";
import type { ConsentRecord, DeletionReceipt } from "../consent";
import type { FlagAcknowledgement } from "../flag";
import type { TransferProbe } from "../transferProbe";
import type { LearningMap } from "../learningMap";
import type { AffectSnapshot, EmotionVocabulary } from "../emotion";
import type { PilotEvent } from "../pilot";

/**
 * Repository ports — the ONLY way the application reaches persistence
 * (CLAUDE.md → Architecture). These are pure interfaces: no implementation, no
 * framework, no I/O detail leaks here. In-memory adapters (P4) and any future
 * Supabase adapter implement them. All methods are async so a networked adapter
 * fits the same shape as an in-memory one.
 */

export interface AssessmentRepository {
  save(assessment: Assessment): Promise<void>;
  findById(id: Id): Promise<Assessment | null>;
}

export interface GoalRepository {
  save(goal: LearningGoal): Promise<void>;
  findById(id: Id): Promise<LearningGoal | null>;
  listByStudent(studentId: Id): Promise<LearningGoal[]>;
}

export interface OutcomeRepository {
  save(outcome: Outcome): Promise<void>;
  findById(id: Id): Promise<Outcome | null>;
  findByAssessmentAndStudent(
    assessmentId: Id,
    studentId: Id,
  ): Promise<Outcome | null>;
}

export interface ReflectionRepository {
  save(reflection: Reflection): Promise<void>;
  findById(id: Id): Promise<Reflection | null>;
  listByStudent(studentId: Id): Promise<Reflection[]>;
}

export interface TransferProbeRepository {
  save(probe: TransferProbe): Promise<void>;
  findById(id: Id): Promise<TransferProbe | null>;
}

export interface LearningMapRepository {
  save(map: LearningMap): Promise<void>;
  findBySkill(skillId: Id): Promise<LearningMap | null>;
}

export interface AffectRepository {
  save(snapshot: AffectSnapshot): Promise<void>;
  findById(id: Id): Promise<AffectSnapshot | null>;
  listByAssessmentAndStudent(
    assessmentId: Id,
    studentId: Id,
  ): Promise<AffectSnapshot[]>;
  /** All of a student's snapshots across assessments (for cohort covariates). */
  listByStudent(studentId: Id): Promise<AffectSnapshot[]>;
  /** Hard-delete every snapshot for a student (consent revocation). Returns the count. */
  deleteByStudent(studentId: Id): Promise<number>;
}

/**
 * Consent records + the deletion receipts a revocation leaves. Consent is stored
 * as an append-only history; the effective scopes are derived in the domain.
 */
export interface ConsentRepository {
  save(record: ConsentRecord): Promise<void>;
  listByStudent(studentId: Id): Promise<ConsentRecord[]>;
  /**
   * Every consent record across all students — the roster-level source for a
   * tenant-scoped compliance export. Consent is stored per student and the tenant
   * lives in the auth layer, so tenant filtering is the caller's job (it resolves
   * each student's tenant); this method only enumerates. Never exposes any
   * emotional content, only the consent lifecycle itself.
   */
  listAll(): Promise<ConsentRecord[]>;
  recordDeletion(receipt: DeletionReceipt): Promise<void>;
  listReceipts(studentId: Id): Promise<DeletionReceipt[]>;
}

/** Teacher acknowledgements of agent flags. One standing flag per student. */
export interface FlagAcknowledgementRepository {
  save(ack: FlagAcknowledgement): Promise<void>;
  find(flagId: Id): Promise<FlagAcknowledgement | null>;
  list(): Promise<FlagAcknowledgement[]>;
}

/**
 * Pilot telemetry events (P17). Append-only, mechanics-only. Written only when the
 * telemetry consent scope is granted; every stored event carries a PSEUDONYM.
 */
export interface PilotEventRepository {
  append(event: PilotEvent): Promise<void>;
  list(): Promise<PilotEvent[]>;
  listByTenant(tenantId: Id): Promise<PilotEvent[]>;
}

/**
 * The pseudonymization table — the ONLY place the real↔pseudonym mapping lives,
 * separate from the events and reachable by the service role only. `resolve`
 * returns a stable pseudonym for a real id, minting one on first use.
 */
export interface PseudonymRepository {
  resolve(realStudentId: Id): Promise<string>;
}

export interface EmotionVocabularyRepository {
  /** The differentiated palette offered to students. */
  find(): Promise<EmotionVocabulary | null>;
  save(vocabulary: EmotionVocabulary): Promise<void>;
}
