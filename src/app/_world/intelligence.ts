import { createLesson } from "@/domain/intelligence/lesson";
import { recordGuardrailTrip } from "./guardrailIncidents";
import {
  createDeterministicReflectionIntelligence,
  createLlmReflectionIntelligence,
} from "@/adapters/intelligence";
import { PINNED_MODELS, createHttpGateway } from "@/adapters/language";
import {
  createMemoryClassSummaryRepository,
  createMemoryLessonRepository,
  createMemoryPerformanceRepository,
  createMemoryQuestionSetRepository,
  createMemoryReflectionSessionRepository,
  createMemoryStudentSummaryRepository,
} from "@/adapters/memory/intelligenceRepositories";
import type { ReflectionIntelligence } from "@/domain/ports/intelligence";
import type {
  ClassSummaryRepository,
  LessonRepository,
  PerformanceRepository,
  QuestionSetRepository,
  ReflectionSessionRepository,
  StudentSummaryRepository,
} from "@/domain/ports/intelligenceRepositories";

/**
 * Wires the reflection-intelligence service and its repositories into the world.
 * The deterministic adapter is the default — and it carries the crisis-safety
 * check (injected from the sanctioned safety boundary, boolean-only) as its safety
 * hook, so the adaptive chat yields to a safety concern even with zero key. When
 * ANTHROPIC_API_KEY is set, the LLM adapter fronts it for drafting; the
 * deterministic adapter (with safety) stays the fallback, so safety and flow are
 * never at the model's mercy.
 */

export interface IntelRepos {
  lessons: LessonRepository;
  questionSets: QuestionSetRepository;
  sessions: ReflectionSessionRepository;
  studentSummaries: StudentSummaryRepository;
  classSummaries: ClassSummaryRepository;
  performances: PerformanceRepository;
}

export function buildIntelligence(
  now: () => Date,
  safetyCheck: (text: string) => boolean,
): ReflectionIntelligence {
  const deterministic = createDeterministicReflectionIntelligence({ now, safetyCheck });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return deterministic;
  const gateway = createHttpGateway({
    apiKey,
    models: PINNED_MODELS,
    now,
    timeoutMs: 8000,
  });
  return createLlmReflectionIntelligence({
    gateway,
    fallback: deterministic,
    now,
    // Feed every guardrail-forced fallback into the self-improving loop.
    onIncident: (trip) => recordGuardrailTrip(trip, now()),
  });
}

export function buildIntelRepos(): IntelRepos {
  return {
    lessons: createMemoryLessonRepository(),
    questionSets: createMemoryQuestionSetRepository(),
    sessions: createMemoryReflectionSessionRepository(),
    studentSummaries: createMemoryStudentSummaryRepository(),
    classSummaries: createMemoryClassSummaryRepository(),
    performances: createMemoryPerformanceRepository(),
  };
}

/** The seeded demo lesson every student can reflect on (id == reflectionId). */
export const DEMO_REFLECTION_ID = "lesson-demo";

/** Seed one lesson + its AI-generated question set so the chat runs out of the box. */
export async function seedDemoReflection(
  intelligence: ReflectionIntelligence,
  intel: IntelRepos,
  now: () => Date,
): Promise<void> {
  const lesson = createLesson({
    id: DEMO_REFLECTION_ID,
    classId: "class-1",
    teacherId: "teacher-1",
    title: "Factoring quadratic equations",
    date: now(),
    lessonType: "independent_practice",
    content:
      "I modeled three examples of factoring quadratic equations, then students solved six problems independently.",
    objectives: [],
    standards: [],
    createdAt: now(),
  });
  await intel.lessons.save(lesson);
  const analysis = await intelligence.analyzeLesson({ lesson });
  const set = await intelligence.generateReflectionQuestions({
    analysis,
    depth: "standard",
    adaptiveFollowups: true,
  });
  await intel.questionSets.save(set);
}
