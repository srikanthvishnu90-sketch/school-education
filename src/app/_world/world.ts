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
  /** The primary (cycle-1) assessment; kept for back-compat. */
  assessment: Assessment;
  /** Every assessment, in cycle order — index + 1 is the cycle number. */
  assessments: Assessment[];
  vocabulary: EmotionVocabulary;
  learningMap: LearningMap;
  /** assessmentId → studentId → per-item correctness (revealed after prediction). */
  answerKey: Record<Id, Record<Id, boolean[]>>;
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
  // Selectable backend: Postgres (Supabase) when configured, else in-memory.
  const core =
    process.env.WORLD_BACKEND === "postgres"
      ? await buildPersistentCore({ connectionString: process.env.DATABASE_URL })
      : buildWorldCore();
  const assessment = buildAssessment();
  const secondAssessment = buildSecondAssessment();
  const learningMap = buildLearningMap();
  const vocabulary = buildEmotionVocabulary();

  await core.repos.assessments.save(assessment);
  await core.repos.assessments.save(secondAssessment);
  await core.repos.learningMaps.save(learningMap);
  await core.repos.emotionVocab.save(vocabulary);

  const answerKey: Record<Id, Record<Id, boolean[]>> = {
    [ASSESSMENT_ID]: {},
    [SECOND_ASSESSMENT_ID]: {},
  };
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
    // "predict" and returns for the second check after completing the first.
    for (const assessmentId of [ASSESSMENT_ID, SECOND_ASSESSMENT_ID]) {
      await core.services.captureGoal({
        studentId: student.id,
        assessmentId,
        targetScore: student.targetScore,
        whyItMatters: student.whyItMatters,
        successCriteriaRef: student.successCriteriaRef,
      });
    }
    answerKey[ASSESSMENT_ID][student.id] = [...student.corrects];
    answerKey[SECOND_ASSESSMENT_ID][student.id] = [...student.corrects2];
  }

  return {
    services: core.services,
    repos: core.repos,
    clock: core.clock,
    telemetry: core.telemetry,
    assessment,
    assessments: [assessment, secondAssessment],
    vocabulary,
    learningMap,
    answerKey,
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
