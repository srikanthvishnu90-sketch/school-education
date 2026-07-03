import {
  ASSESSMENT_ID,
  SEED_STUDENTS,
  SKILL_LINEAR,
  SKILL_SLOPE,
  buildAssessment,
  buildEmotionVocabulary,
  buildLearningMap,
  buildWorldCore,
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
  assessment: Assessment;
  vocabulary: EmotionVocabulary;
  learningMap: LearningMap;
  /** studentId → per-item correctness (the outcome revealed after prediction). */
  answerKey: Record<Id, boolean[]>;
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
  const learningMap = buildLearningMap();
  const vocabulary = buildEmotionVocabulary();

  await core.repos.assessments.save(assessment);
  await core.repos.learningMaps.save(learningMap);
  await core.repos.emotionVocab.save(vocabulary);

  const answerKey: Record<Id, boolean[]> = {};
  for (const student of SEED_STUDENTS) {
    // Consent (academic + affect) is granted for the demo student up front, so
    // the optional emotional step is permitted; a real app collects this at
    // sign-up. Affect capture refuses without it (P12).
    await core.consentService.grant({
      studentId: student.id,
      grantorType: "parent",
      scopes: ["academic", "affect"],
    });
    // The teacher's goal is already set; the student starts at "predict".
    await core.services.captureGoal({
      studentId: student.id,
      assessmentId: ASSESSMENT_ID,
      targetScore: student.targetScore,
      whyItMatters: student.whyItMatters,
      successCriteriaRef: student.successCriteriaRef,
    });
    answerKey[student.id] = [...student.corrects];
  }

  return {
    services: core.services,
    repos: core.repos,
    clock: core.clock,
    assessment,
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
