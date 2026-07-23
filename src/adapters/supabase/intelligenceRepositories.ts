import { createLesson, type Lesson } from "@/domain/intelligence/lesson";
import {
  createReflectionQuestionSet,
  type ReflectionQuestionSet,
} from "@/domain/intelligence/question";
import {
  createReflectionSession,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import {
  createStudentInsightSummary,
  createClassInsightSummary,
  type ClassInsightSummary,
  type StudentInsightSummary,
} from "@/domain/intelligence/insight";
import {
  createReflectionPerformance,
  type ReflectionPerformance,
} from "@/domain/intelligence/metacognition";
import {
  createCalibrationRecord,
  createEvidence,
  createSkillTag,
  type CalibrationRecord,
  type Evidence,
  type SkillTag,
} from "@/domain/intelligence/calibrationModel";
import type {
  CalibrationRecordRepository,
  ClassSummaryRepository,
  EvidenceRepository,
  LessonRepository,
  PerformanceRepository,
  QuestionSetRepository,
  ReflectionSessionRepository,
  SkillTagRepository,
  StudentSummaryRepository,
} from "@/domain/ports/intelligenceRepositories";
import type { SqlClient } from "./client";
import { applyMigrations } from "./migrate";
import { createDataCipher, type DataCipher } from "./cipher";

/**
 * Postgres persistence for the reflection-intelligence entities — the actual
 * product surface (lessons, question sets, sessions, summaries, performances).
 * Each row is a jsonb `data` blob plus the indexed owner columns every lookup
 * filters on. Reads go through the service pool today; these tables live in the
 * `intel` schema, RLS-enabled with authenticated access revoked, so they are
 * service-role-only until the authenticated request path lands.
 *
 * DDL is self-provisioned on build (idempotent), mirroring the credential store.
 */

const DDL = `
create schema if not exists intel;

create table if not exists intel.lessons (
  id text primary key,
  class_id text not null,
  teacher_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists lessons_class_idx on intel.lessons (class_id);

create table if not exists intel.question_sets (
  lesson_id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists intel.reflection_sessions (
  id text primary key,
  reflection_id text not null,
  student_id text not null,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_reflection_idx on intel.reflection_sessions (reflection_id);
create index if not exists sessions_student_idx on intel.reflection_sessions (student_id);

create table if not exists intel.student_summaries (
  id text primary key,
  reflection_id text not null,
  student_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create unique index if not exists student_summary_key on intel.student_summaries (reflection_id, student_id);
create index if not exists student_summary_student_idx on intel.student_summaries (student_id);

create table if not exists intel.class_summaries (
  reflection_id text primary key,
  class_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists intel.reflection_performances (
  reflection_id text not null,
  student_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (reflection_id, student_id)
);
create index if not exists performance_student_idx on intel.reflection_performances (student_id);
`;

/**
 * The skill-tag calibration model tables (calibrationModel.ts, brief §2). A SEPARATE,
 * additive migration: shipped migrations are checksum-immutable, so the calibration
 * tables arrive as their own numbered step rather than editing `0003_intel_schema`.
 * Each row is a jsonb `data` blob plus the owner columns its list queries filter on.
 */
const CALIBRATION_DDL = `
create table if not exists intel.skill_tags (
  id text primary key,
  class_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists skill_tags_class_idx on intel.skill_tags (class_id);

create table if not exists intel.evidence (
  id text primary key,
  student_id text not null,
  lesson_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists evidence_student_idx on intel.evidence (student_id);
create index if not exists evidence_student_lesson_idx on intel.evidence (student_id, lesson_id);

create table if not exists intel.calibration_records (
  id text primary key,
  student_id text not null,
  skill_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists calibration_student_idx on intel.calibration_records (student_id);
create index if not exists calibration_student_skill_idx on intel.calibration_records (student_id, skill_id);
`;

const SERVICE_ONLY = [
  "intel.lessons",
  "intel.question_sets",
  "intel.reflection_sessions",
  "intel.student_summaries",
  "intel.class_summaries",
  "intel.reflection_performances",
  "intel.skill_tags",
  "intel.evidence",
  "intel.calibration_records",
];

async function provision(client: SqlClient): Promise<void> {
  await applyMigrations(client, [
    { id: "0003_intel_schema", sql: DDL },
    { id: "0004_calibration_schema", sql: CALIBRATION_DDL },
  ]);
  for (const t of SERVICE_ONLY) {
    // Enable RLS with no authenticated grant/policy → service-role-only.
    await client.query(`alter table ${t} enable row level security;`);
    await client.query(`revoke all on ${t} from public;`);
  }
}

type Row<T> = { data: T } & Record<string, unknown>;

/**
 * Encode an entity for storage. With a cipher, the payload is a self-describing
 * `{ enc }` envelope (AES-256-GCM), so an at-rest row reveals nothing; without
 * one it is the plain object. No schema change — the `data` jsonb holds either.
 */
function encode(entity: unknown, cipher: DataCipher | null): string {
  if (cipher === null) return JSON.stringify(entity);
  return JSON.stringify({ enc: cipher.seal(JSON.stringify(entity)) });
}

/** Reverse of encode: transparently decrypts an `{ enc }` envelope if present. */
function decode<T>(raw: unknown, cipher: DataCipher | null): T {
  if (raw !== null && typeof raw === "object" && "enc" in raw) {
    const sealed = (raw as { enc: string }).enc;
    if (cipher === null) throw new Error("encrypted row but no REFLECTION_KEY_HEX");
    return JSON.parse(cipher.open(sealed)) as T;
  }
  return raw as T;
}

async function one<T>(
  client: SqlClient,
  cipher: DataCipher | null,
  sql: string,
  params: readonly unknown[],
): Promise<T | null> {
  const { rows } = await client.query<Row<unknown>>(sql, params);
  return rows[0] === undefined ? null : decode<T>(rows[0].data, cipher);
}

async function many<T>(
  client: SqlClient,
  cipher: DataCipher | null,
  sql: string,
  params: readonly unknown[],
): Promise<T[]> {
  const { rows } = await client.query<Row<unknown>>(sql, params);
  return rows.map((r) => decode<T>(r.data, cipher));
}

// --- Revivers: jsonb stores dates as ISO strings; rebuild them at the boundary --

function reviveLesson(d: Lesson): Lesson {
  return createLesson({
    ...d,
    date: new Date(d.date),
    createdAt: new Date(d.createdAt),
  });
}

function reviveQuestionSet(d: ReflectionQuestionSet): ReflectionQuestionSet {
  return createReflectionQuestionSet({
    ...d,
    createdAt: new Date(d.createdAt),
    approvedAt: d.approvedAt === null ? null : new Date(d.approvedAt),
  });
}

function reviveSession(d: ReflectionSession): ReflectionSession {
  return createReflectionSession({
    ...d,
    startedAt: new Date(d.startedAt),
    completedAt: d.completedAt !== undefined ? new Date(d.completedAt) : undefined,
    messages: d.messages.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })),
  });
}

function reviveStudentSummary(d: StudentInsightSummary): StudentInsightSummary {
  return createStudentInsightSummary({ ...d, createdAt: new Date(d.createdAt) });
}

function reviveClassSummary(d: ClassInsightSummary): ClassInsightSummary {
  return createClassInsightSummary({ ...d, createdAt: new Date(d.createdAt) });
}

function revivePerformance(d: ReflectionPerformance): ReflectionPerformance {
  return createReflectionPerformance({ ...d, recordedAt: new Date(d.recordedAt) });
}

// SkillTag and Evidence carry no dates; round-trip them through the domain factory
// for the same validation the sibling revivers apply.
function reviveSkillTag(d: SkillTag): SkillTag {
  return createSkillTag({ ...d });
}

function reviveEvidence(d: Evidence): Evidence {
  return createEvidence({ ...d });
}

function reviveCalibrationRecord(d: CalibrationRecord): CalibrationRecord {
  return createCalibrationRecord({ ...d, computedAt: new Date(d.computedAt) });
}

// --- The six adapters ---------------------------------------------------------

export function createPgLessonRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): LessonRepository {
  return {
    async save(lesson) {
      await client.query(
        `insert into intel.lessons (id, class_id, teacher_id, data) values ($1,$2,$3,$4)
         on conflict (id) do update set class_id=excluded.class_id, teacher_id=excluded.teacher_id, data=excluded.data`,
        [lesson.id, lesson.classId, lesson.teacherId, encode(lesson, cipher)],
      );
    },
    async findById(id) {
      const d = await one<Lesson>(client, cipher, "select data from intel.lessons where id=$1", [id]);
      return d === null ? null : reviveLesson(d);
    },
    async listByClass(classId) {
      const rows = await many<Lesson>(
        client,
        cipher,
        "select data from intel.lessons where class_id=$1 order by created_at",
        [classId],
      );
      return rows.map(reviveLesson);
    },
    async delete(id) {
      await client.query("delete from intel.lessons where id=$1", [id]);
    },
  };
}

export function createPgQuestionSetRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): QuestionSetRepository {
  return {
    async save(set) {
      await client.query(
        `insert into intel.question_sets (lesson_id, data) values ($1,$2)
         on conflict (lesson_id) do update set data=excluded.data`,
        [set.lessonId, encode(set, cipher)],
      );
    },
    async findByLesson(lessonId) {
      const d = await one<ReflectionQuestionSet>(
        client,
        cipher,
        "select data from intel.question_sets where lesson_id=$1",
        [lessonId],
      );
      return d === null ? null : reviveQuestionSet(d);
    },
    async deleteByLesson(lessonId) {
      await client.query("delete from intel.question_sets where lesson_id=$1", [
        lessonId,
      ]);
    },
  };
}

export function createPgReflectionSessionRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): ReflectionSessionRepository {
  return {
    async save(session) {
      await client.query(
        `insert into intel.reflection_sessions (id, reflection_id, student_id, status, data)
         values ($1,$2,$3,$4,$5)
         on conflict (id) do update set reflection_id=excluded.reflection_id,
           student_id=excluded.student_id, status=excluded.status, data=excluded.data`,
        [
          session.id,
          session.reflectionId,
          session.studentId,
          session.status,
          encode(session, cipher),
        ],
      );
    },
    async findById(id) {
      const d = await one<ReflectionSession>(
        client,
        cipher,
        "select data from intel.reflection_sessions where id=$1",
        [id],
      );
      return d === null ? null : reviveSession(d);
    },
    async findByReflectionAndStudent(reflectionId, studentId) {
      const d = await one<ReflectionSession>(
        client,
        cipher,
        "select data from intel.reflection_sessions where reflection_id=$1 and student_id=$2",
        [reflectionId, studentId],
      );
      return d === null ? null : reviveSession(d);
    },
    async listByStudent(studentId) {
      return (
        await many<ReflectionSession>(
          client,
          cipher,
          "select data from intel.reflection_sessions where student_id=$1 order by created_at",
          [studentId],
        )
      ).map(reviveSession);
    },
    async listByReflection(reflectionId) {
      return (
        await many<ReflectionSession>(
          client,
          cipher,
          "select data from intel.reflection_sessions where reflection_id=$1 order by created_at",
          [reflectionId],
        )
      ).map(reviveSession);
    },
    async deleteByStudent(studentId) {
      const { rows } = await client.query<{ id: string } & Record<string, unknown>>(
        "delete from intel.reflection_sessions where student_id=$1 returning id",
        [studentId],
      );
      return rows.length;
    },
  };
}

export function createPgStudentSummaryRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): StudentSummaryRepository {
  return {
    async save(summary) {
      await client.query(
        `insert into intel.student_summaries (id, reflection_id, student_id, data)
         values ($1,$2,$3,$4)
         on conflict (id) do update set reflection_id=excluded.reflection_id,
           student_id=excluded.student_id, data=excluded.data`,
        [summary.id, summary.reflectionId, summary.studentId, encode(summary, cipher)],
      );
    },
    async findByReflectionAndStudent(reflectionId, studentId) {
      const d = await one<StudentInsightSummary>(
        client,
        cipher,
        "select data from intel.student_summaries where reflection_id=$1 and student_id=$2",
        [reflectionId, studentId],
      );
      return d === null ? null : reviveStudentSummary(d);
    },
    async listByStudent(studentId) {
      return (
        await many<StudentInsightSummary>(
          client,
          cipher,
          "select data from intel.student_summaries where student_id=$1 order by created_at",
          [studentId],
        )
      ).map(reviveStudentSummary);
    },
    async listByReflection(reflectionId) {
      return (
        await many<StudentInsightSummary>(
          client,
          cipher,
          "select data from intel.student_summaries where reflection_id=$1 order by created_at",
          [reflectionId],
        )
      ).map(reviveStudentSummary);
    },
    async deleteByStudent(studentId) {
      const { rows } = await client.query<{ id: string } & Record<string, unknown>>(
        "delete from intel.student_summaries where student_id=$1 returning id",
        [studentId],
      );
      return rows.length;
    },
  };
}

export function createPgClassSummaryRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): ClassSummaryRepository {
  return {
    async save(summary) {
      await client.query(
        `insert into intel.class_summaries (reflection_id, class_id, data) values ($1,$2,$3)
         on conflict (reflection_id) do update set class_id=excluded.class_id, data=excluded.data`,
        [summary.reflectionId, summary.classId, encode(summary, cipher)],
      );
    },
    async findByReflection(reflectionId) {
      const d = await one<ClassInsightSummary>(
        client,
        cipher,
        "select data from intel.class_summaries where reflection_id=$1",
        [reflectionId],
      );
      return d === null ? null : reviveClassSummary(d);
    },
  };
}

export function createPgPerformanceRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): PerformanceRepository {
  return {
    async save(performance) {
      await client.query(
        `insert into intel.reflection_performances (reflection_id, student_id, data)
         values ($1,$2,$3)
         on conflict (reflection_id, student_id) do update set data=excluded.data`,
        [performance.reflectionId, performance.studentId, encode(performance, cipher)],
      );
    },
    async findByReflectionAndStudent(reflectionId, studentId) {
      const d = await one<ReflectionPerformance>(
        client,
        cipher,
        "select data from intel.reflection_performances where reflection_id=$1 and student_id=$2",
        [reflectionId, studentId],
      );
      return d === null ? null : revivePerformance(d);
    },
    async listByStudent(studentId) {
      return (
        await many<ReflectionPerformance>(
          client,
          cipher,
          "select data from intel.reflection_performances where student_id=$1 order by created_at",
          [studentId],
        )
      ).map(revivePerformance);
    },
    async deleteByStudent(studentId) {
      const { rows } = await client.query<{ reflection_id: string } & Record<string, unknown>>(
        "delete from intel.reflection_performances where student_id=$1 returning reflection_id",
        [studentId],
      );
      return rows.length;
    },
  };
}

export function createPgSkillTagRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): SkillTagRepository {
  return {
    async save(skill) {
      await client.query(
        `insert into intel.skill_tags (id, class_id, data) values ($1,$2,$3)
         on conflict (id) do update set class_id=excluded.class_id, data=excluded.data`,
        [skill.id, skill.classId, encode(skill, cipher)],
      );
    },
    async findById(id) {
      const d = await one<SkillTag>(
        client,
        cipher,
        "select data from intel.skill_tags where id=$1",
        [id],
      );
      return d === null ? null : reviveSkillTag(d);
    },
    async listByClass(classId) {
      return (
        await many<SkillTag>(
          client,
          cipher,
          "select data from intel.skill_tags where class_id=$1 order by created_at",
          [classId],
        )
      ).map(reviveSkillTag);
    },
  };
}

export function createPgEvidenceRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): EvidenceRepository {
  return {
    async save(evidence) {
      await client.query(
        `insert into intel.evidence (id, student_id, lesson_id, data) values ($1,$2,$3,$4)
         on conflict (id) do update set student_id=excluded.student_id,
           lesson_id=excluded.lesson_id, data=excluded.data`,
        [evidence.id, evidence.studentId, evidence.lessonId, encode(evidence, cipher)],
      );
    },
    async listByStudentAndLesson(studentId, lessonId) {
      return (
        await many<Evidence>(
          client,
          cipher,
          "select data from intel.evidence where student_id=$1 and lesson_id=$2 order by created_at",
          [studentId, lessonId],
        )
      ).map(reviveEvidence);
    },
    async listByStudent(studentId) {
      return (
        await many<Evidence>(
          client,
          cipher,
          "select data from intel.evidence where student_id=$1 order by created_at",
          [studentId],
        )
      ).map(reviveEvidence);
    },
    async deleteByStudent(studentId) {
      const { rows } = await client.query<{ id: string } & Record<string, unknown>>(
        "delete from intel.evidence where student_id=$1 returning id",
        [studentId],
      );
      return rows.length;
    },
  };
}

export function createPgCalibrationRecordRepository(
  client: SqlClient,
  cipher: DataCipher | null = null,
): CalibrationRecordRepository {
  return {
    async save(record) {
      await client.query(
        `insert into intel.calibration_records (id, student_id, skill_id, data) values ($1,$2,$3,$4)
         on conflict (id) do update set student_id=excluded.student_id,
           skill_id=excluded.skill_id, data=excluded.data`,
        [record.id, record.studentId, record.skillId, encode(record, cipher)],
      );
    },
    async listByStudent(studentId) {
      return (
        await many<CalibrationRecord>(
          client,
          cipher,
          "select data from intel.calibration_records where student_id=$1 order by created_at",
          [studentId],
        )
      ).map(reviveCalibrationRecord);
    },
    async listByStudentAndSkill(studentId, skillId) {
      return (
        await many<CalibrationRecord>(
          client,
          cipher,
          "select data from intel.calibration_records where student_id=$1 and skill_id=$2 order by created_at",
          [studentId, skillId],
        )
      ).map(reviveCalibrationRecord);
    },
    async deleteByStudent(studentId) {
      const { rows } = await client.query<{ id: string } & Record<string, unknown>>(
        "delete from intel.calibration_records where student_id=$1 returning id",
        [studentId],
      );
      return rows.length;
    },
  };
}

export interface PgIntelRepos {
  lessons: LessonRepository;
  questionSets: QuestionSetRepository;
  sessions: ReflectionSessionRepository;
  studentSummaries: StudentSummaryRepository;
  classSummaries: ClassSummaryRepository;
  performances: PerformanceRepository;
  skillTags: SkillTagRepository;
  evidence: EvidenceRepository;
  calibrationRecords: CalibrationRecordRepository;
}

/**
 * Provision the schema and return the six Postgres-backed intelligence repos.
 * When REFLECTION_KEY_HEX is set, every payload (student chat text, emotional
 * summaries, scores) is AES-256-GCM encrypted at rest.
 */
export async function createPgIntelRepos(client: SqlClient): Promise<PgIntelRepos> {
  await provision(client);
  const cipher = createDataCipher();
  return {
    lessons: createPgLessonRepository(client, cipher),
    questionSets: createPgQuestionSetRepository(client, cipher),
    sessions: createPgReflectionSessionRepository(client, cipher),
    studentSummaries: createPgStudentSummaryRepository(client, cipher),
    classSummaries: createPgClassSummaryRepository(client, cipher),
    performances: createPgPerformanceRepository(client, cipher),
    skillTags: createPgSkillTagRepository(client, cipher),
    evidence: createPgEvidenceRepository(client, cipher),
    calibrationRecords: createPgCalibrationRecordRepository(client, cipher),
  };
}
