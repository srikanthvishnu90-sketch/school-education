import {
  ASSESSMENT_ID,
  SECOND_ASSESSMENT_ID,
  SEED_STUDENTS,
  SKILL_LINEAR,
  SKILL_SLOPE,
  buildAssessment,
  buildEmotionVocabulary,
  buildLearningMap,
  buildSecondAssessment,
  buildWorldCore,
  type PilotTelemetry,
  type Repos,
  type Services,
} from "@/application";
import { buildPersistentCore } from "@/application/persistent";
import type { Assessment, EmotionVocabulary, Id, LearningMap } from "@/domain";
import type { Clock } from "@/domain/ports";
import type { SqlClient } from "@/adapters/supabase";
import {
  createImportedGradeStore,
  createPgImportedGradeStore,
  type ImportedGradeStore,
} from "./importedGrades";

/**
 * The single in-memory world the student surface is wired to. There is no
 * database, no auth, no live data: one process-lifetime seeded world holds the
 * teacher's assessment, the learning map, the emotion vocabulary, and a goal per
 * archetype student. The student then plays the cycle live through P4 services —
 * their prediction, affect, reflection, and next action are captured here.
 *
 * The "answer key" (what the student actually got right) is fixed per archetype
 * and revealed only AFTER the prediction is registered, never before.
 */

export interface World {
  services: Services;
  repos: Repos;
  clock: Clock;
  /** Consent-gated, pseudonymizing pilot telemetry recorder (P17). */
  telemetry: PilotTelemetry;
  /** Gradebook grades imported via /ingest, surfaced to the student (p7). */
  importedGrades: ImportedGradeStore;
  /** The primary (cycle-1) assessment; kept for back-compat. */
  assessment: Assessment;
  /** Every assessment, in cycle order — index + 1 is the cycle number. */
  assessments: Assessment[];
  vocabulary: EmotionVocabulary;
  learningMap: LearningMap;
  students: { id: Id; archetype: string }[];
}

/** Human-readable skill names for TASK-focused copy (never institutional codes). */
export const SKILL_NAMES: Record<Id, string> = {
  [SKILL_LINEAR]: "linear equations",
  [SKILL_SLOPE]: "interpreting slope",
};

/** The default demo student — the overconfident-low archetype (the target case). */
export const DEFAULT_STUDENT_ID = "student-avery";

export const DEMO_ASSESSMENT_ID = ASSESSMENT_ID;

async function build(): Promise<World> {
  // Persistence by default: whenever a database is configured (DATABASE_URL, or an
  // explicit WORLD_BACKEND=postgres), use Postgres — buildPersistentCore
  // self-provisions (idempotent migrations + RLS), so an empty DB just works and
  // state survives restarts. With no DB configured, fall back to the zero-infra
  // in-memory world so `pnpm dev` runs anywhere.
  const usePostgres =
    process.env.WORLD_BACKEND === "postgres" ||
    (process.env.DATABASE_URL ?? "").length > 0;
  const core = usePostgres
    ? await buildPersistentCore({ connectionString: process.env.DATABASE_URL })
    : buildWorldCore();
  // Under Postgres the persistent core exposes its client; use it so imported
  // grades persist too. In-memory otherwise.
  const pgClient: SqlClient | null =
    "client" in core ? (core as { client: SqlClient }).client : null;
  const importedGrades =
    pgClient !== null
      ? createPgImportedGradeStore(pgClient, core.clock)
      : createImportedGradeStore();
  const assessment = buildAssessment();
  const secondAssessment = buildSecondAssessment();
  const learningMap = buildLearningMap();
  const vocabulary = buildEmotionVocabulary();

  await core.repos.assessments.save(assessment);
  await core.repos.assessments.save(secondAssessment);
  await core.repos.learningMaps.save(learningMap);
  await core.repos.emotionVocab.save(vocabulary);

  for (const student of SEED_STUDENTS) {
    // Consent (academic + affect + telemetry) is granted for the demo student up
    // front, so the optional emotional step is permitted and pilot events may be
    // recorded; a real app collects this at sign-up. Each capture refuses without
    // its scope (P12/P17).
    await core.consentService.grant({
      studentId: student.id,
      grantorType: "parent",
      scopes: ["academic", "affect", "telemetry"],
    });
    // The teacher's goals are already set for both cycles; the student starts at
    // "predict" and returns for the second check after completing the first. The
    // outcome is graded from the student's real answers (no seeded answer key).
    for (const assessmentId of [ASSESSMENT_ID, SECOND_ASSESSMENT_ID]) {
      await core.services.captureGoal({
        studentId: student.id,
        assessmentId,
        targetScore: student.targetScore,
        whyItMatters: student.whyItMatters,
        successCriteriaRef: student.successCriteriaRef,
      });
    }
  }

  return {
    services: core.services,
    repos: core.repos,
    clock: core.clock,
    telemetry: core.telemetry,
    importedGrades,
    assessment,
    assessments: [assessment, secondAssessment],
    vocabulary,
    learningMap,
    students: SEED_STUDENTS.map((s) => ({ id: s.id, archetype: s.archetype })),
  };
}

let worldPromise: Promise<World> | null = null;

/** The process-lifetime world, built lazily on first use. */
export function getWorld(): Promise<World> {
  if (worldPromise === null) worldPromise = build();
  return worldPromise;
}

/** True when the student has a known goal (i.e. is a seeded archetype). */
export function isKnownStudent(world: World, studentId: Id): boolean {
  return world.students.some((s) => s.id === studentId);
}

/** The assessment with this id, or null. */
export function assessmentById(world: World, assessmentId: Id): Assessment | null {
  return world.assessments.find((a) => a.id === assessmentId) ?? null;
}

/** True when this is one of the world's known assessments (a real cycle). */
export function isKnownAssessment(world: World, assessmentId: Id): boolean {
  return world.assessments.some((a) => a.id === assessmentId);
}

/** The 1-based cycle number of an assessment, or null if unknown. */
export function cycleNumberOf(world: World, assessmentId: Id): number | null {
  const idx = world.assessments.findIndex((a) => a.id === assessmentId);
  return idx === -1 ? null : idx + 1;
}
