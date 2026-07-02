import {
  createAssessment,
  createEmotionVocabulary,
  createLearningMap,
  type Assessment,
  type EmotionLabel,
  type EmotionVocabulary,
  type Id,
  type LearningMap,
} from "@/domain";
import {
  createActionVerificationRepository,
  createAffectRepository,
  createAssessmentRepository,
  createCalibrationRepository,
  createEmotionVocabularyRepository,
  createGoalRepository,
  createLearningMapRepository,
  createOutcomeRepository,
  createPredictionRepository,
  createReflectionRepository,
  createSequentialClock,
  createSequentialIdGenerator,
  createTransferProbeRepository,
} from "@/adapters/memory";
import type {
  ActionVerificationRepository,
  AffectRepository,
  AssessmentRepository,
  CalibrationRepository,
  Clock,
  EmotionVocabularyRepository,
  GoalRepository,
  IdGenerator,
  LearningMapRepository,
  OutcomeRepository,
  PredictionRepository,
  ReflectionRepository,
  TransferProbeRepository,
} from "@/domain/ports";
import { createServices, type Services } from "./services";
import {
  createVerificationService,
  type VerificationService,
} from "./verification";
import {
  createAgentLoop,
  createObserver,
  interventionPolicy,
  type AgentLoop,
} from "./agent";
import { createDeterministicLanguageCapability } from "@/adapters/language";

/**
 * buildSeededWorld — the composition root. It is the ONE place allowed to import
 * concrete adapters (services never do). It wires in-memory adapters with a
 * deterministic clock + id generator and plays the two-axis loop for three
 * archetype students, so the whole "feels good about a 50" story runs end to end
 * with zero infrastructure. Fully deterministic: same inputs, same world.
 */

// Fixed instant so timestamps are reproducible (Date.UTC is deterministic).
export const START_EPOCH = Date.UTC(2026, 0, 5, 9, 0, 0);

export const CLASS_ID = "class-algebra1-p3";
export const ASSESSMENT_ID = "assess-algebra1-u1";
export const SKILL_LINEAR = "skill-linear-equations";
export const SKILL_SLOPE = "skill-interpreting-slope";

export const ITEM_IDS = ["item-1", "item-2", "item-3", "item-4"] as const;

export type Archetype =
  "overconfident-low" | "underconfident-high" | "calibrated";

export interface SeedStudent {
  id: Id;
  archetype: Archetype;
  targetScore: number;
  whyItMatters: string;
  successCriteriaRef: string;
  confidences: [number, number, number, number];
  globalPredicted: number;
  corrects: [boolean, boolean, boolean, boolean];
  labels: EmotionLabel[];
}

export const SEED_STUDENTS: SeedStudent[] = [
  {
    // Predicted high, scored 1/4 vs a 0.7 goal — yet names a single, undifferentiated
    // "good". Overconfident + over_positive congruence + LOW granularity. Target case.
    id: "student-avery",
    archetype: "overconfident-low",
    targetScore: 0.7,
    whyItMatters: "I want to place into honors next year.",
    successCriteriaRef: "exemplar:two-step-linear-worked",
    confidences: [0.9, 0.9, 0.9, 0.9],
    globalPredicted: 0.8,
    corrects: [true, false, false, false],
    labels: [{ term: "good", valence: 0.6, arousal: 0.5 }],
  },
  {
    // Predicted low, scored 4/4 above a 0.6 goal — yet feels anxious/drained.
    id: "student-blake",
    archetype: "underconfident-high",
    targetScore: 0.6,
    whyItMatters: "I want to stop freezing on tests.",
    successCriteriaRef: "exemplar:slope-from-table-worked",
    confidences: [0.3, 0.3, 0.3, 0.3],
    globalPredicted: 0.4,
    corrects: [true, true, true, true],
    labels: [
      { term: "anxious", valence: -0.6, arousal: 0.8 },
      { term: "drained", valence: -0.4, arousal: 0.3 },
    ],
  },
  {
    // Predicted ~0.75, scored 3/4 vs a 0.6 goal — mildly content. Aligned + congruent.
    id: "student-casey",
    archetype: "calibrated",
    targetScore: 0.6,
    whyItMatters: "I want to actually understand slope, not memorize it.",
    successCriteriaRef: "exemplar:slope-meaning-worked",
    confidences: [0.8, 0.8, 0.7, 0.7],
    globalPredicted: 0.75,
    corrects: [true, true, true, false],
    labels: [
      { term: "content", valence: 0.3, arousal: 0.3 },
      { term: "focused", valence: 0.1, arousal: 0.6 },
      { term: "satisfied", valence: 0.5, arousal: 0.2 },
    ],
  },
];

/** A differentiated palette spanning the valence × arousal circumplex. */
export function buildEmotionVocabulary(): EmotionVocabulary {
  return createEmotionVocabulary({
    terms: [
      { term: "anxious", valence: -0.6, arousal: 0.85 },
      { term: "frustrated", valence: -0.7, arousal: 0.6 },
      { term: "discouraged", valence: -0.5, arousal: 0.2 },
      { term: "drained", valence: -0.4, arousal: 0.3 },
      { term: "bored", valence: -0.2, arousal: 0.15 },
      { term: "calm", valence: 0.3, arousal: 0.15 },
      { term: "content", valence: 0.4, arousal: 0.3 },
      { term: "focused", valence: 0.2, arousal: 0.65 },
      { term: "hopeful", valence: 0.5, arousal: 0.6 },
      { term: "proud", valence: 0.8, arousal: 0.7 },
    ],
  });
}

export function buildAssessment(): Assessment {
  return createAssessment({
    id: ASSESSMENT_ID,
    title: "Algebra I — Unit 1 check",
    createdAt: new Date(START_EPOCH),
    items: [
      {
        id: ITEM_IDS[0],
        assessmentId: ASSESSMENT_ID,
        skillId: SKILL_LINEAR,
        prompt: "Solve 3x + 5 = 20.",
        maxPoints: 1,
      },
      {
        id: ITEM_IDS[1],
        assessmentId: ASSESSMENT_ID,
        skillId: SKILL_LINEAR,
        prompt: "Solve 2(x - 4) = 10.",
        maxPoints: 1,
      },
      {
        id: ITEM_IDS[2],
        assessmentId: ASSESSMENT_ID,
        skillId: SKILL_SLOPE,
        prompt: "Find the slope through (1, 2) and (3, 8).",
        maxPoints: 1,
      },
      {
        id: ITEM_IDS[3],
        assessmentId: ASSESSMENT_ID,
        skillId: SKILL_SLOPE,
        prompt: "What does the slope mean in context?",
        maxPoints: 1,
      },
    ],
  });
}

export function buildLearningMap(): LearningMap {
  return createLearningMap({
    id: "map-linear-equations",
    skillId: SKILL_LINEAR,
    currentBandId: "band-linear-developing",
    bands: [
      {
        id: "band-linear-emerging",
        skillId: SKILL_LINEAR,
        label: "Emerging",
        order: 1,
        descriptor:
          "Isolates the variable in one step. Exemplar: exemplar:one-step-linear-worked",
      },
      {
        id: "band-linear-developing",
        skillId: SKILL_LINEAR,
        label: "Developing",
        order: 2,
        descriptor:
          "Solves two-step equations. Exemplar: exemplar:two-step-linear-worked",
      },
      {
        id: "band-linear-secure",
        skillId: SKILL_LINEAR,
        label: "Secure",
        order: 3,
        descriptor:
          "Solves with variables on both sides. Exemplar: exemplar:both-sides-linear-worked",
      },
    ],
  });
}

export interface Repos {
  assessments: AssessmentRepository;
  goals: GoalRepository;
  predictions: PredictionRepository;
  outcomes: OutcomeRepository;
  reflections: ReflectionRepository;
  calibrations: CalibrationRepository;
  transferProbes: TransferProbeRepository;
  learningMaps: LearningMapRepository;
  affects: AffectRepository;
  emotionVocab: EmotionVocabularyRepository;
  verifications: ActionVerificationRepository;
}

export interface SeededWorld {
  services: Services;
  verification: VerificationService;
  repos: Repos;
  agent: AgentLoop;
  clock: Clock;
  ids: IdGenerator;
  classId: Id;
  assessmentId: Id;
  students: { id: Id; archetype: Archetype }[];
}

/** The adapter wiring shared by every composition (seeded AND ingested). */
export interface WorldCore {
  repos: Repos;
  clock: Clock;
  ids: IdGenerator;
  services: Services;
  verification: VerificationService;
  agent: AgentLoop;
}

/**
 * Wires in-memory adapters, a deterministic clock + id generator, the P4
 * services, and the agent loop. Compositions differ only in how they POPULATE
 * this world (seed data vs ingested evidence).
 */
export function buildWorldCore(): WorldCore {
  const repos: Repos = {
    assessments: createAssessmentRepository(),
    goals: createGoalRepository(),
    predictions: createPredictionRepository(),
    outcomes: createOutcomeRepository(),
    reflections: createReflectionRepository(),
    calibrations: createCalibrationRepository(),
    transferProbes: createTransferProbeRepository(),
    learningMaps: createLearningMapRepository(),
    affects: createAffectRepository(),
    emotionVocab: createEmotionVocabularyRepository(),
    verifications: createActionVerificationRepository(),
  };

  const clock = createSequentialClock(START_EPOCH);
  const ids = createSequentialIdGenerator();

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

  return { repos, clock, ids, services, verification, agent };
}

export async function buildSeededWorld(): Promise<SeededWorld> {
  const { repos, clock, ids, services, verification, agent } = buildWorldCore();

  // Static world.
  await repos.assessments.save(buildAssessment());
  await repos.learningMaps.save(buildLearningMap());
  await repos.emotionVocab.save(buildEmotionVocabulary());

  // Play the loop per student (deterministic clock guarantees predict < outcome).
  for (const s of SEED_STUDENTS) {
    await services.captureGoal({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      targetScore: s.targetScore,
      whyItMatters: s.whyItMatters,
      successCriteriaRef: s.successCriteriaRef,
    });
    await services.capturePrediction({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      itemPredictions: ITEM_IDS.map((itemId, i) => ({
        itemId,
        confidence: s.confidences[i],
      })),
      globalPredicted: s.globalPredicted,
    });
    await services.recordOutcome({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      itemOutcomes: ITEM_IDS.map((itemId, i) => ({
        itemId,
        correct: s.corrects[i],
        pointsAwarded: s.corrects[i] ? 1 : 0,
      })),
    });
    await services.captureAffect({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      labels: s.labels,
      phase: "post_evidence",
    });
  }

  return {
    services,
    verification,
    repos,
    agent,
    clock,
    ids,
    classId: CLASS_ID,
    assessmentId: ASSESSMENT_ID,
    students: SEED_STUDENTS.map((s) => ({ id: s.id, archetype: s.archetype })),
  };
}
