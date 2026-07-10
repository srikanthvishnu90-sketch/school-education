import {
  createDeterministicReflectionIntelligence,
  createLlmReflectionIntelligence,
} from "@/adapters/intelligence";
import { PINNED_MODELS, createHttpGateway } from "@/adapters/language";
import {
  createMemoryClassSummaryRepository,
  createMemoryLessonRepository,
  createMemoryQuestionSetRepository,
  createMemoryReflectionSessionRepository,
  createMemoryStudentSummaryRepository,
} from "@/adapters/memory/intelligenceRepositories";
import type { ReflectionIntelligence } from "@/domain/ports/intelligence";
import type {
  ClassSummaryRepository,
  LessonRepository,
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
  return createLlmReflectionIntelligence({ gateway, fallback: deterministic, now });
}

export function buildIntelRepos(): IntelRepos {
  return {
    lessons: createMemoryLessonRepository(),
    questionSets: createMemoryQuestionSetRepository(),
    sessions: createMemoryReflectionSessionRepository(),
    studentSummaries: createMemoryStudentSummaryRepository(),
    classSummaries: createMemoryClassSummaryRepository(),
  };
}
