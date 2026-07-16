import { createLesson } from "@/domain/intelligence/lesson";
import { SEED_STUDENTS } from "@/application";
import { recordGuardrailTrip } from "./guardrailIncidents";
import { TEACHER_NAME, studentDisplayName } from "./teacher";
import { COUNSELOR_NAME } from "./roles";
import { NORTH_STUDENT_ID } from "./credentials";
import { rosterRedactionTerms } from "./rosterNames";
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
import { createPgIntelRepos } from "@/adapters/supabase";
import type { SqlClient } from "@/adapters/supabase";
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

/**
 * The known-identity roster redacted from every payload before it reaches the
 * model — student first names and staff names (full and title-stripped surname).
 * This is what makes `stripPii`'s `extraTerms` non-empty in the request path: the
 * generic email/id/number rules can't safely catch bare proper nouns without
 * over-redacting ordinary words, so the caller supplies the names it holds. The
 * union across tenants is intentional — redacting a name that can't appear only
 * ever adds privacy, never removes it. Word-boundary matched, so "Chen" never
 * touches "kitchen".
 */
export function piiRoster(): string[] {
  const names = new Set<string>();
  const add = (raw: string): void => {
    const n = raw.trim();
    if (n.length >= 3) names.add(n);
  };
  for (const s of SEED_STUDENTS) add(studentDisplayName(s.id));
  add(studentDisplayName(NORTH_STUDENT_ID));
  // Staff: keep the full display name AND the title-stripped surname, since a
  // student may write either "Ms. Rivera" or "Rivera".
  for (const full of [TEACHER_NAME, COUNSELOR_NAME, "Ms. Chen"]) {
    add(full);
    add(full.replace(/^(mr|ms|mrs|dr|mx)\.?\s+/i, ""));
  }
  return [...names];
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
    // Redact the known roster before any student/lesson text leaves the process.
    // Resolved live: the static seed identities PLUS any names a teacher has
    // registered since build, so the redaction set grows with real class data.
    config: { pii: () => [...piiRoster(), ...rosterRedactionTerms()] },
    // Feed every guardrail-forced fallback into the self-improving loop.
    onIncident: (trip) => recordGuardrailTrip(trip, now()),
  });
}

/**
 * The reflection-intelligence repositories. Postgres-backed (durable, survives
 * restart / serverless) when a client is provided, else in-memory. The client is
 * the same one the rest of the persistent world uses, so backend selection stays
 * in one place (world.ts, gated on DATABASE_URL).
 */
export async function buildIntelRepos(
  pgClient: SqlClient | null,
): Promise<IntelRepos> {
  if (pgClient !== null) return createPgIntelRepos(pgClient);
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
/** The second district's seeded lesson — proves a north student never sees it. */
export const NORTH_REFLECTION_ID = "lesson-north-demo";

interface SeedLessonSpec {
  id: string;
  tenantId: string;
  teacherId: string;
  title: string;
  content: string;
}

const SEED_LESSONS: readonly SeedLessonSpec[] = [
  {
    id: DEMO_REFLECTION_ID,
    tenantId: "district-demo",
    teacherId: "teacher-1",
    title: "Factoring quadratic equations",
    content:
      "I modeled three examples of factoring quadratic equations, then students solved six problems independently.",
  },
  {
    id: NORTH_REFLECTION_ID,
    tenantId: "district-north",
    teacherId: "teacher-north",
    title: "Photosynthesis lab",
    content:
      "Students ran a photosynthesis lab in pairs, measured oxygen output, then recorded observations independently.",
  },
];

async function seedOne(
  intelligence: ReflectionIntelligence,
  intel: IntelRepos,
  now: () => Date,
  spec: SeedLessonSpec,
): Promise<void> {
  // Already seeded (durable Postgres across restarts) → skip the analyze/generate
  // work and its LLM calls. In-memory always re-seeds since it starts empty.
  if (
    (await intel.lessons.findById(spec.id)) !== null &&
    (await intel.questionSets.findByLesson(spec.id)) !== null
  ) {
    return;
  }
  const lesson = createLesson({
    id: spec.id,
    tenantId: spec.tenantId,
    classId: "class-1", // shared class id — isolation is by tenant, not class
    teacherId: spec.teacherId,
    title: spec.title,
    date: now(),
    lessonType: "independent_practice",
    content: spec.content,
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

/** Seed each district's demo lesson + questions so the chat runs out of the box. */
export async function seedDemoReflection(
  intelligence: ReflectionIntelligence,
  intel: IntelRepos,
  now: () => Date,
): Promise<void> {
  for (const spec of SEED_LESSONS) {
    await seedOne(intelligence, intel, now, spec);
  }
}
