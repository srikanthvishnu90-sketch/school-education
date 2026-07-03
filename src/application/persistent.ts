import { createDeterministicLanguageCapability } from "@/adapters/language";
import {
  createSequentialClock,
  createSequentialIdGenerator,
} from "@/adapters/memory";
import {
  createPgActionVerificationRepository,
  createPgAffectRepository,
  createPgAssessmentRepository,
  createPgCalibrationRepository,
  createPgClient,
  createPgEmotionVocabularyRepository,
  createPgGoalRepository,
  createPgLearningMapRepository,
  createPgOutcomeRepository,
  createPgPredictionRepository,
  createPgReflectionRepository,
  createPgTransferProbeRepository,
  runMigrations,
  type SqlClient,
} from "@/adapters/supabase";
import {
  createAgentLoop,
  createObserver,
  interventionPolicy,
} from "./agent";
import {
  ASSESSMENT_ID,
  CLASS_ID,
  ITEM_IDS,
  SEED_STUDENTS,
  START_EPOCH,
  buildAssessment,
  buildEmotionVocabulary,
  buildLearningMap,
  type Repos,
  type SeededWorld,
  type WorldCore,
} from "./seed";
import { createServices } from "./services";
import { createVerificationService } from "./verification";

/**
 * The persistent composition root. It wires the SAME services and agent as
 * buildWorldCore, but over the Postgres adapters instead of the in-memory ones —
 * the domain is untouched; only the adapters change. Migrations are applied on
 * build; the injected clock stamps every row's created_at.
 */

export interface PersistentOptions {
  client?: SqlClient;
  connectionString?: string;
}

export interface PersistentCore extends WorldCore {
  client: SqlClient;
}

export async function buildPersistentCore(
  opts: PersistentOptions = {},
): Promise<PersistentCore> {
  const client =
    opts.client ??
    createPgClient(opts.connectionString ?? process.env.DATABASE_URL ?? "");
  await runMigrations(client);

  const clock = createSequentialClock(START_EPOCH);
  const ids = createSequentialIdGenerator();

  const repos: Repos = {
    assessments: createPgAssessmentRepository(client, clock),
    goals: createPgGoalRepository(client, clock),
    predictions: createPgPredictionRepository(client, clock),
    outcomes: createPgOutcomeRepository(client, clock),
    reflections: createPgReflectionRepository(client, clock),
    calibrations: createPgCalibrationRepository(client, clock),
    transferProbes: createPgTransferProbeRepository(client, clock),
    learningMaps: createPgLearningMapRepository(client, clock),
    affects: createPgAffectRepository(client, clock),
    emotionVocab: createPgEmotionVocabularyRepository(client, clock),
    verifications: createPgActionVerificationRepository(client, clock),
  };

  const services = createServices({
    clock,
    ids,
    assessments: repos.assessments,
    goals: repos.goals,
    predictions: repos.predictions,
    outcomes: repos.outcomes,
    reflections: repos.reflections,
    transferProbes: repos.transferProbes,
    affects: repos.affects,
  });

  const verification = createVerificationService({
    clock,
    ids,
    assessments: repos.assessments,
    predictions: repos.predictions,
    outcomes: repos.outcomes,
    verifications: repos.verifications,
  });

  const agent = createAgentLoop({
    observer: createObserver({
      clock,
      assessments: repos.assessments,
      predictions: repos.predictions,
      outcomes: repos.outcomes,
      goals: repos.goals,
      affects: repos.affects,
      reflections: repos.reflections,
      calibrations: repos.calibrations,
      verifications: repos.verifications,
    }),
    policy: interventionPolicy,
    services,
    assessments: repos.assessments,
    language: createDeterministicLanguageCapability(),
    clock,
  });

  return { repos, clock, ids, services, verification, agent, client };
}

/**
 * buildPersistentWorld — mirrors buildSeededWorld exactly (same static world,
 * same archetype loop) but against Postgres, so the whole two-axis story runs
 * end to end on a real database. Selectable by env in the app.
 */
export async function buildPersistentWorld(
  opts: PersistentOptions = {},
): Promise<SeededWorld> {
  const core = await buildPersistentCore(opts);

  await core.repos.assessments.save(buildAssessment());
  await core.repos.learningMaps.save(buildLearningMap());
  await core.repos.emotionVocab.save(buildEmotionVocabulary());

  for (const s of SEED_STUDENTS) {
    await core.services.captureGoal({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      targetScore: s.targetScore,
      whyItMatters: s.whyItMatters,
      successCriteriaRef: s.successCriteriaRef,
    });
    await core.services.capturePrediction({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      itemPredictions: ITEM_IDS.map((itemId, i) => ({
        itemId,
        confidence: s.confidences[i],
      })),
      globalPredicted: s.globalPredicted,
    });
    await core.services.recordOutcome({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      itemOutcomes: ITEM_IDS.map((itemId, i) => ({
        itemId,
        correct: s.corrects[i],
        pointsAwarded: s.corrects[i] ? 1 : 0,
      })),
    });
    await core.services.captureAffect({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      labels: s.labels,
      phase: "post_evidence",
    });
  }

  return {
    services: core.services,
    verification: core.verification,
    repos: core.repos,
    agent: core.agent,
    clock: core.clock,
    ids: core.ids,
    classId: CLASS_ID,
    assessmentId: ASSESSMENT_ID,
    students: SEED_STUDENTS.map((s) => ({ id: s.id, archetype: s.archetype })),
  };
}
