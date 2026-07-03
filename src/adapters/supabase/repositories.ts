import {
  createActionVerification,
  createAffectSnapshot,
  createAssessment,
  createCalibrationRecord,
  createConsentRecord,
  createEmotionVocabulary,
  createLearningGoal,
  createLearningMap,
  createOutcome,
  createPrediction,
  createReflection,
  createTransferProbe,
  type ActionVerification,
  type AffectSnapshot,
  type Assessment,
  type CalibrationRecord,
  type ConsentRecord,
  type DeletionReceipt,
  type EmotionVocabulary,
  type LearningGoal,
  type LearningMap,
  type Outcome,
  type Prediction,
  type Reflection,
  type TransferProbe,
} from "@/domain";
import type {
  ActionVerificationRepository,
  AffectRepository,
  AssessmentRepository,
  CalibrationRepository,
  Clock,
  ConsentRepository,
  EmotionVocabularyRepository,
  GoalRepository,
  LearningMapRepository,
  OutcomeRepository,
  PredictionRepository,
  ReflectionRepository,
  TransferProbeRepository,
} from "@/domain/ports";
import { DEFAULT_TENANT_ID, type SqlClient } from "./client";

/**
 * One Postgres adapter per repository port. Each is constructor-injected with a
 * SqlClient and a Clock: the client is the only I/O, and `created_at` is stamped
 * from the clock at write time (never a DB now()). Rows are mapped back to domain
 * entities through the P2 factories (the same Zod schemas), so a row that cannot
 * form a valid aggregate is rejected at the boundary, exactly as elsewhere.
 */

type Row = Record<string, unknown>;

/** Upsert by a conflict key; every column but the key and `seq` is refreshed. */
async function upsertRow(
  client: SqlClient,
  table: string,
  row: Row,
  conflict = "id",
): Promise<void> {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const updates = cols
    .filter((c) => c !== conflict && c !== "seq")
    .map((c) => `${c} = excluded.${c}`);
  await client.query(
    `insert into ${table} (${cols.join(", ")}) values (${placeholders.join(", ")}) ` +
      `on conflict (${conflict}) do update set ${updates.join(", ")}`,
    Object.values(row),
  );
}

/** The newest matching row's `data`, or null. Newest = highest insertion seq. */
async function selectOne<T>(
  client: SqlClient,
  table: string,
  where: string,
  params: readonly unknown[],
): Promise<T | null> {
  const { rows } = await client.query<{ data: T }>(
    `select data from ${table} where ${where} order by seq desc limit 1`,
    params,
  );
  return rows.length > 0 ? rows[0].data : null;
}

/** All matching rows' `data`, in insertion order. */
async function selectMany<T>(
  client: SqlClient,
  table: string,
  where: string,
  params: readonly unknown[],
): Promise<T[]> {
  const { rows } = await client.query<{ data: T }>(
    `select data from ${table} where ${where} order by seq asc`,
    params,
  );
  return rows.map((r) => r.data);
}

function base(id: string): Row {
  return { id, tenant_id: DEFAULT_TENANT_ID };
}

// --- Date revival: jsonb stores dates as ISO strings; revive before the factory.

function d(value: unknown): Date {
  return new Date(value as string);
}

interface RawGoal extends Omit<LearningGoal, "createdAt"> {
  createdAt: string;
}
interface RawAssessment extends Omit<Assessment, "createdAt"> {
  createdAt: string;
}
interface RawPrediction extends Omit<Prediction, "createdAt"> {
  createdAt: string;
}
interface RawOutcome extends Omit<Outcome, "scoredAt"> {
  scoredAt: string;
}
interface RawReflection
  extends Omit<Reflection, "createdAt" | "nextAction"> {
  createdAt: string;
  nextAction: { text: string; dueBy: string };
}
interface RawCalibration extends Omit<CalibrationRecord, "computedAt"> {
  computedAt: string;
}
interface RawProbe extends Omit<TransferProbe, "createdAt"> {
  createdAt: string;
}
interface RawAffect extends Omit<AffectSnapshot, "createdAt"> {
  createdAt: string;
}
interface RawVerification
  extends Omit<ActionVerification, "openedAt" | "closedAt"> {
  openedAt: string;
  closedAt?: string;
}
interface RawConsent extends Omit<ConsentRecord, "grantedAt" | "revokedAt"> {
  grantedAt: string;
  revokedAt?: string;
}
interface RawReceipt extends Omit<DeletionReceipt, "deletedAt"> {
  deletedAt: string;
}

// --- The adapters -------------------------------------------------------------

export function createPgAssessmentRepository(
  client: SqlClient,
  clock: Clock,
): AssessmentRepository {
  return {
    async save(a) {
      await upsertRow(client, "academic.assessments", {
        ...base(a.id),
        class_id: null,
        data: JSON.stringify(a),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawAssessment>(
        client,
        "academic.assessments",
        "id = $1",
        [id],
      );
      return raw === null
        ? null
        : createAssessment({ ...raw, createdAt: d(raw.createdAt) });
    },
  };
}

export function createPgGoalRepository(
  client: SqlClient,
  clock: Clock,
): GoalRepository {
  const revive = (raw: RawGoal): LearningGoal =>
    createLearningGoal({ ...raw, createdAt: d(raw.createdAt) });
  return {
    async save(g) {
      await upsertRow(client, "academic.goals", {
        ...base(g.id),
        student_id: g.studentId,
        assessment_id: g.assessmentId,
        data: JSON.stringify(g),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawGoal>(client, "academic.goals", "id = $1", [
        id,
      ]);
      return raw === null ? null : revive(raw);
    },
    async listByStudent(studentId) {
      const raws = await selectMany<RawGoal>(
        client,
        "academic.goals",
        "student_id = $1",
        [studentId],
      );
      return raws.map(revive);
    },
  };
}

export function createPgPredictionRepository(
  client: SqlClient,
  clock: Clock,
): PredictionRepository {
  const revive = (raw: RawPrediction): Prediction =>
    createPrediction({ ...raw, createdAt: d(raw.createdAt) });
  return {
    async save(p) {
      await upsertRow(client, "academic.predictions", {
        ...base(p.id),
        student_id: p.studentId,
        assessment_id: p.assessmentId,
        data: JSON.stringify(p),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawPrediction>(
        client,
        "academic.predictions",
        "id = $1",
        [id],
      );
      return raw === null ? null : revive(raw);
    },
    async findByAssessmentAndStudent(assessmentId, studentId) {
      const raw = await selectOne<RawPrediction>(
        client,
        "academic.predictions",
        "assessment_id = $1 and student_id = $2",
        [assessmentId, studentId],
      );
      return raw === null ? null : revive(raw);
    },
  };
}

export function createPgOutcomeRepository(
  client: SqlClient,
  clock: Clock,
): OutcomeRepository {
  const revive = (raw: RawOutcome): Outcome =>
    createOutcome({ ...raw, scoredAt: d(raw.scoredAt) });
  return {
    async save(o) {
      await upsertRow(client, "academic.outcomes", {
        ...base(o.id),
        student_id: o.studentId,
        assessment_id: o.assessmentId,
        data: JSON.stringify(o),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawOutcome>(
        client,
        "academic.outcomes",
        "id = $1",
        [id],
      );
      return raw === null ? null : revive(raw);
    },
    async findByAssessmentAndStudent(assessmentId, studentId) {
      const raw = await selectOne<RawOutcome>(
        client,
        "academic.outcomes",
        "assessment_id = $1 and student_id = $2",
        [assessmentId, studentId],
      );
      return raw === null ? null : revive(raw);
    },
  };
}

export function createPgReflectionRepository(
  client: SqlClient,
  clock: Clock,
): ReflectionRepository {
  const revive = (raw: RawReflection): Reflection =>
    createReflection({
      ...raw,
      nextAction: { text: raw.nextAction.text, dueBy: d(raw.nextAction.dueBy) },
      createdAt: d(raw.createdAt),
    });
  return {
    async save(r) {
      await upsertRow(client, "academic.reflections", {
        ...base(r.id),
        student_id: r.studentId,
        assessment_id: r.assessmentId,
        data: JSON.stringify(r),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawReflection>(
        client,
        "academic.reflections",
        "id = $1",
        [id],
      );
      return raw === null ? null : revive(raw);
    },
    async listByStudent(studentId) {
      const raws = await selectMany<RawReflection>(
        client,
        "academic.reflections",
        "student_id = $1",
        [studentId],
      );
      return raws.map(revive);
    },
  };
}

export function createPgCalibrationRepository(
  client: SqlClient,
  clock: Clock,
): CalibrationRepository {
  const revive = (raw: RawCalibration): CalibrationRecord =>
    createCalibrationRecord({ ...raw, computedAt: d(raw.computedAt) });
  return {
    async save(record) {
      await upsertRow(client, "academic.calibration_records", {
        ...base(record.id),
        student_id: record.studentId,
        assessment_id: record.assessmentId,
        data: JSON.stringify(record),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawCalibration>(
        client,
        "academic.calibration_records",
        "id = $1",
        [id],
      );
      return raw === null ? null : revive(raw);
    },
    async listByStudent(studentId) {
      const raws = await selectMany<RawCalibration>(
        client,
        "academic.calibration_records",
        "student_id = $1",
        [studentId],
      );
      return raws.map(revive);
    },
  };
}

export function createPgTransferProbeRepository(
  client: SqlClient,
  clock: Clock,
): TransferProbeRepository {
  return {
    async save(probe) {
      await upsertRow(client, "academic.transfer_probes", {
        ...base(probe.id),
        assessment_id: probe.assessmentId,
        skill_id: probe.skillId,
        data: JSON.stringify(probe),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawProbe>(
        client,
        "academic.transfer_probes",
        "id = $1",
        [id],
      );
      return raw === null
        ? null
        : createTransferProbe({ ...raw, createdAt: d(raw.createdAt) });
    },
  };
}

export function createPgLearningMapRepository(
  client: SqlClient,
  clock: Clock,
): LearningMapRepository {
  return {
    async save(map) {
      await upsertRow(client, "academic.learning_maps", {
        ...base(map.id),
        skill_id: map.skillId,
        student_id: map.studentId ?? null,
        data: JSON.stringify(map),
        created_at: clock.now(),
      });
    },
    async findBySkill(skillId) {
      const raw = await selectOne<LearningMap>(
        client,
        "academic.learning_maps",
        "skill_id = $1",
        [skillId],
      );
      return raw === null ? null : createLearningMap(raw);
    },
  };
}

export function createPgAffectRepository(
  client: SqlClient,
  clock: Clock,
): AffectRepository {
  const revive = (raw: RawAffect): AffectSnapshot =>
    createAffectSnapshot({ ...raw, createdAt: d(raw.createdAt) });
  return {
    async save(snapshot) {
      await upsertRow(client, "emotional.affect_snapshots", {
        ...base(snapshot.id),
        student_id: snapshot.studentId,
        assessment_id: snapshot.assessmentId,
        data: JSON.stringify(snapshot),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawAffect>(
        client,
        "emotional.affect_snapshots",
        "id = $1",
        [id],
      );
      return raw === null ? null : revive(raw);
    },
    async listByAssessmentAndStudent(assessmentId, studentId) {
      const raws = await selectMany<RawAffect>(
        client,
        "emotional.affect_snapshots",
        "assessment_id = $1 and student_id = $2",
        [assessmentId, studentId],
      );
      return raws.map(revive);
    },
    async listByStudent(studentId) {
      const raws = await selectMany<RawAffect>(
        client,
        "emotional.affect_snapshots",
        "student_id = $1",
        [studentId],
      );
      return raws.map(revive);
    },
    async deleteByStudent(studentId) {
      const { rows } = await client.query<{ id: string }>(
        "delete from emotional.affect_snapshots where student_id = $1 returning id",
        [studentId],
      );
      return rows.length;
    },
  };
}

export function createPgConsentRepository(
  client: SqlClient,
  clock: Clock,
): ConsentRepository {
  const reviveConsent = (raw: RawConsent): ConsentRecord => {
    const { grantedAt, revokedAt, ...rest } = raw;
    return createConsentRecord({
      ...rest,
      grantedAt: d(grantedAt),
      ...(revokedAt !== undefined && revokedAt !== null
        ? { revokedAt: d(revokedAt) }
        : {}),
    });
  };
  return {
    async save(record) {
      await upsertRow(client, "academic.consent_records", {
        ...base(record.id),
        student_id: record.studentId,
        data: JSON.stringify(record),
        created_at: clock.now(),
      });
    },
    async listByStudent(studentId) {
      const raws = await selectMany<RawConsent>(
        client,
        "academic.consent_records",
        "student_id = $1",
        [studentId],
      );
      return raws.map(reviveConsent);
    },
    async recordDeletion(receipt) {
      await upsertRow(client, "academic.deletion_receipts", {
        ...base(receipt.id),
        student_id: receipt.studentId,
        data: JSON.stringify(receipt),
        created_at: clock.now(),
      });
    },
    async listReceipts(studentId) {
      const raws = await selectMany<RawReceipt>(
        client,
        "academic.deletion_receipts",
        "student_id = $1",
        [studentId],
      );
      return raws.map((raw) => ({ ...raw, deletedAt: d(raw.deletedAt) }));
    },
  };
}

export function createPgEmotionVocabularyRepository(
  client: SqlClient,
  clock: Clock,
): EmotionVocabularyRepository {
  return {
    async find() {
      const raw = await selectOne<EmotionVocabulary>(
        client,
        "emotional.emotion_vocabularies",
        "id = $1",
        ["singleton"],
      );
      return raw === null ? null : createEmotionVocabulary(raw);
    },
    async save(vocabulary) {
      await upsertRow(client, "emotional.emotion_vocabularies", {
        ...base("singleton"),
        data: JSON.stringify(vocabulary),
        created_at: clock.now(),
      });
    },
  };
}

export function createPgActionVerificationRepository(
  client: SqlClient,
  clock: Clock,
): ActionVerificationRepository {
  const revive = (raw: RawVerification): ActionVerification => {
    const { closedAt, openedAt, ...rest } = raw;
    return createActionVerification({
      ...rest,
      openedAt: d(openedAt),
      ...(closedAt !== undefined && closedAt !== null
        ? { closedAt: d(closedAt) }
        : {}),
    });
  };
  return {
    async save(verification) {
      await upsertRow(client, "academic.action_verifications", {
        ...base(verification.id),
        student_id: verification.studentId,
        target_skill_id: verification.targetSkillId,
        data: JSON.stringify(verification),
        created_at: clock.now(),
      });
    },
    async findById(id) {
      const raw = await selectOne<RawVerification>(
        client,
        "academic.action_verifications",
        "id = $1",
        [id],
      );
      return raw === null ? null : revive(raw);
    },
    async listByStudent(studentId) {
      const raws = await selectMany<RawVerification>(
        client,
        "academic.action_verifications",
        "student_id = $1",
        [studentId],
      );
      return raws.map(revive);
    },
  };
}
