import {
  createAssessment,
  createEmotionVocabulary,
  createLearningMap,
  type Assessment,
  type EmotionVocabulary,
  type Id,
  type LearningMap,
} from "@/domain";
import {
  createAffectRepository,
  createAssessmentRepository,
  createConsentRepository,
  createEmotionVocabularyRepository,
  createFlagAcknowledgementRepository,
  createGoalRepository,
  createLearningMapRepository,
  createOutcomeRepository,
  createPilotEventRepository,
  createPseudonymRepository,
  createReflectionRepository,
  createSequentialClock,
  createSequentialIdGenerator,
  createTransferProbeRepository,
} from "@/adapters/memory";
import type {
  AffectRepository,
  AssessmentRepository,
  Clock,
  ConsentRepository,
  EmotionVocabularyRepository,
  FlagAcknowledgementRepository,
  GoalRepository,
  IdGenerator,
  LearningMapRepository,
  OutcomeRepository,
  PilotEventRepository,
  ReflectionRepository,
  TransferProbeRepository,
} from "@/domain/ports";
import { createConsentService, type ConsentService } from "./consent";
import { createPilotTelemetry, type PilotTelemetry } from "./pilot";
import { createServices, type Services } from "./services";

/**
 * buildWorldCore — the composition root. It is the ONE place allowed to import
 * concrete adapters (services never do). It wires in-memory adapters with a
 * deterministic clock + id generator, so the product runs end to end with zero
 * infrastructure. Fully deterministic: same inputs, same world. The pre-assessment
 * prediction/calibration/agent machinery was retired; the seeded roster carries
 * only the identity + goal context the surviving surfaces read.
 */

// Fixed instant so timestamps are reproducible (Date.UTC is deterministic).
export const START_EPOCH = Date.UTC(2026, 0, 5, 9, 0, 0);

export const CLASS_ID = "class-algebra1-p3";
export const ASSESSMENT_ID = "assess-algebra1-u1";
/** The second cycle — the return path the pilot's core metric measures (P17). */
export const SECOND_ASSESSMENT_ID = "assess-algebra1-u2";
export const SKILL_LINEAR = "skill-linear-equations";
export const SKILL_SLOPE = "skill-interpreting-slope";

export const ITEM_IDS = ["item-1", "item-2", "item-3", "item-4"] as const;
export const ITEM_IDS_2 = ["item-5", "item-6", "item-7", "item-8"] as const;

export type Archetype =
  "overconfident-low" | "underconfident-high" | "calibrated";

export interface SeedStudent {
  id: Id;
  archetype: Archetype;
  targetScore: number;
  whyItMatters: string;
  successCriteriaRef: string;
}

export const SEED_STUDENTS: SeedStudent[] = [
  {
    id: "student-avery",
    archetype: "overconfident-low",
    targetScore: 0.7,
    whyItMatters: "I want to place into honors next year.",
    successCriteriaRef: "exemplar:two-step-linear-worked",
  },
  {
    id: "student-blake",
    archetype: "underconfident-high",
    targetScore: 0.6,
    whyItMatters: "I want to stop freezing on tests.",
    successCriteriaRef: "exemplar:slope-from-table-worked",
  },
  {
    id: "student-casey",
    archetype: "calibrated",
    targetScore: 0.6,
    whyItMatters: "I want to actually understand slope, not memorize it.",
    successCriteriaRef: "exemplar:slope-meaning-worked",
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
        answer: "5",
      },
      {
        id: ITEM_IDS[1],
        assessmentId: ASSESSMENT_ID,
        skillId: SKILL_LINEAR,
        prompt: "Solve 2(x - 4) = 10.",
        maxPoints: 1,
        answer: "9",
      },
      {
        id: ITEM_IDS[2],
        assessmentId: ASSESSMENT_ID,
        skillId: SKILL_SLOPE,
        prompt: "Find the slope through (1, 2) and (3, 8).",
        maxPoints: 1,
        answer: "3",
      },
      {
        id: ITEM_IDS[3],
        assessmentId: ASSESSMENT_ID,
        skillId: SKILL_SLOPE,
        prompt: "Find the slope through (0, 1) and (2, 7).",
        maxPoints: 1,
        answer: "3",
      },
    ],
  });
}

/** The second cycle's assessment — same skills, fresh items (the return check). */
export function buildSecondAssessment(): Assessment {
  return createAssessment({
    id: SECOND_ASSESSMENT_ID,
    title: "Algebra I — Unit 2 check",
    createdAt: new Date(START_EPOCH),
    items: [
      {
        id: ITEM_IDS_2[0],
        assessmentId: SECOND_ASSESSMENT_ID,
        skillId: SKILL_LINEAR,
        prompt: "Solve 4x - 7 = 13.",
        maxPoints: 1,
        answer: "5",
      },
      {
        id: ITEM_IDS_2[1],
        assessmentId: SECOND_ASSESSMENT_ID,
        skillId: SKILL_LINEAR,
        prompt: "Solve 3(x + 2) = 21.",
        maxPoints: 1,
        answer: "5",
      },
      {
        id: ITEM_IDS_2[2],
        assessmentId: SECOND_ASSESSMENT_ID,
        skillId: SKILL_SLOPE,
        prompt: "Find the slope through (2, 3) and (6, 11).",
        maxPoints: 1,
        answer: "2",
      },
      {
        id: ITEM_IDS_2[3],
        assessmentId: SECOND_ASSESSMENT_ID,
        skillId: SKILL_SLOPE,
        prompt: "A line rises 6 for every 2 across — what is its slope?",
        maxPoints: 1,
        answer: "3",
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
  outcomes: OutcomeRepository;
  reflections: ReflectionRepository;
  transferProbes: TransferProbeRepository;
  learningMaps: LearningMapRepository;
  affects: AffectRepository;
  emotionVocab: EmotionVocabularyRepository;
  consent: ConsentRepository;
  flagAcks: FlagAcknowledgementRepository;
  pilotEvents: PilotEventRepository;
}

/** The adapter wiring shared by every composition (in-memory AND persistent). */
export interface WorldCore {
  repos: Repos;
  clock: Clock;
  ids: IdGenerator;
  services: Services;
  consentService: ConsentService;
  telemetry: PilotTelemetry;
}

/**
 * Wires in-memory adapters, a deterministic clock + id generator, and the
 * application services. Populating the world (seed data) is left to the caller.
 */
export function buildWorldCore(): WorldCore {
  const repos: Repos = {
    assessments: createAssessmentRepository(),
    goals: createGoalRepository(),
    outcomes: createOutcomeRepository(),
    reflections: createReflectionRepository(),
    transferProbes: createTransferProbeRepository(),
    learningMaps: createLearningMapRepository(),
    affects: createAffectRepository(),
    emotionVocab: createEmotionVocabularyRepository(),
    consent: createConsentRepository(),
    flagAcks: createFlagAcknowledgementRepository(),
    pilotEvents: createPilotEventRepository(),
  };

  const clock = createSequentialClock(START_EPOCH);
  const ids = createSequentialIdGenerator();

  const services = createServices({
    clock,
    ids,
    assessments: repos.assessments,
    goals: repos.goals,
    outcomes: repos.outcomes,
    reflections: repos.reflections,
    transferProbes: repos.transferProbes,
    affects: repos.affects,
    consent: repos.consent,
  });

  const consentService = createConsentService({
    clock,
    ids,
    consent: repos.consent,
    affects: repos.affects,
  });

  // Pilot telemetry recorder — consent-gated, pseudonymizing (P17).
  const telemetry = createPilotTelemetry({
    clock,
    consent: repos.consent,
    pseudonyms: createPseudonymRepository(),
    events: repos.pilotEvents,
  });

  return {
    repos,
    clock,
    ids,
    services,
    consentService,
    telemetry,
  };
}
