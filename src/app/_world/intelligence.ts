import { createLesson } from "@/domain/intelligence/lesson";
import { approveQuestionSet } from "@/domain/intelligence/question";
import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import { createReflectionPerformance } from "@/domain/intelligence/metacognition";
import type { ConversationStep } from "@/domain/ports/intelligence";
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

/**
 * The deterministic engine on its own — used to SEED the demo lessons. Seeding
 * must never make a network call: it runs on the first request into a cold
 * process (and on every serverless cold start with the in-memory backend), so
 * routing it through the live model would block that first page for tens of
 * seconds on model latency/retries. The demo questions are fixed content the
 * deterministic engine produces instantly; real teacher-authored lessons still
 * get the model when it's keyed.
 */
export function buildSeedIntelligence(
  now: () => Date,
  safetyCheck: (text: string) => boolean,
): ReflectionIntelligence {
  return createDeterministicReflectionIntelligence({ now, safetyCheck });
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
    // These calls sit on the interactive request path (a teacher creating a
    // lesson waits for two of them, back to back), so bound each one tightly and
    // DON'T retry — a slow or unreachable model falls straight to the
    // deterministic engine instead of making a teacher wait. Worst case is ~2×4s,
    // and the health monitor throttles a persistently-slow model to instant.
    timeoutMs: 4000,
    maxRetries: 0,
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
    // A SECOND demo lesson in the same class, so a student can reflect twice — which
    // is what makes loop closure ("last time you chose X — what happened?") and a
    // multi-day "My journey" visible out of the box.
    id: "lesson-demo-slope",
    tenantId: "district-demo",
    teacherId: "teacher-1",
    title: "Slope of a line",
    content:
      "I showed how to find the slope between two points, then students found the slope for eight point-pairs on their own.",
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
  // Seeded demo lessons are teacher-authored, so they ship pre-approved — the
  // demo chat runs out of the box without a manual review step.
  await intel.questionSets.save(approveQuestionSet(set, now()));
}

/**
 * A demo student's sample reflection: rich, free-response answers keyed to each
 * question's category, a confidence prediction, one chosen next step, and the
 * teacher's later score. The three archetypes produce three calibration outcomes
 * (over-confident / under-confident / aligned) so the timeline + class brief show
 * a real spread. The answers are written to model the psychology the questions
 * probe — the emotional journey (Barrett granularity) AND technical mastery
 * (retrieval), not one-word replies.
 */
interface DemoReflection {
  studentId: string;
  forethought: string; // metacognitive short-response (goal + self-efficacy)
  technical: string; // the mastery/retrieval answer
  emotional: string; // the feeling, in their words
  behavioral: string; // what they did next
  predictionLabel: string; // the confidence rating they pick
  nextStep: string; // the one step they commit to
  score: number; // the teacher's later result (0..1) — reality, vs. confidence
}

const DEMO_REFLECTIONS: readonly DemoReflection[] = [
  {
    // Avery — overconfident: high confidence, a lower real score (unchecked sign errors).
    studentId: "student-avery",
    forethought:
      "I wanted to factor all six on my own without peeking at a worked example — I'm trying to place into honors next year, so I want to prove I can do it clean.",
    technical:
      "Factoring clicked fast. For each one I found the two numbers that multiply to the constant and add to the middle coefficient, split the middle term, and grouped it into two binomials. I flew through all six.",
    emotional:
      "Honestly I felt calm and a little proud. It came quick and I never really got stuck, so I felt like I had it.",
    behavioral:
      "I finished early so I just turned it in. I didn't go back and recheck the signs on the middle term.",
    predictionLabel: "Completely",
    nextStep: "Try a harder mixed set and actually check each sign before I move on.",
    score: 0.6,
  },
  {
    // Blake — underconfident: low confidence, a much higher real score (did well, didn't trust it).
    studentId: "student-blake",
    forethought:
      "My goal was honestly just to not freeze up the way I do on tests. I wasn't sure I could get through them, so I wanted to stay calm and finish.",
    technical:
      "The box method mostly worked for me. I set the products in the corners and read the factors off the sides. I think I flipped a sign on the middle term once or twice, and I second-guessed even the ones I got right.",
    emotional:
      "I felt nervous the whole time, and kind of discouraged. Even when a problem came out right, I didn't trust that it was actually right.",
    behavioral:
      "I asked for help once when I got stuck, then I went back and redid two problems to double-check myself.",
    predictionLabel: "A little",
    nextStep: "Check the sign on the middle term first, and trust a problem when I've checked it.",
    score: 0.85,
  },
  {
    // Casey — calibrated: confidence matches the real result.
    studentId: "student-casey",
    forethought:
      "I wanted to actually understand factoring, not just memorize the steps — so I was trying to be able to explain WHY the box method works, not only get answers.",
    technical:
      "The box method made sense. I slowed down on the sign in the middle term and it worked out. Two of them I wasn't fully sure about, so I flagged those in my head.",
    emotional:
      "I felt focused most of the time. A little rushed near the end, but okay — steady, not panicked.",
    behavioral:
      "I checked two of them by multiplying the factors back together to see if I got the original quadratic.",
    predictionLabel: "Mostly",
    nextStep: "Explain factoring to a friend to test whether I really understand it, not just do it.",
    score: 0.7,
  },
];

/** The persona's free-response answer for a given question turn (by category/format). */
function demoAnswerFor(step: ConversationStep, r: DemoReflection): string {
  if (step.kind !== "question") return "";
  if (step.format === "rating") return r.predictionLabel;
  switch (step.category) {
    case "technical":
      return r.technical;
    case "emotional":
      return r.emotional;
    case "behavioral":
      return r.behavioral;
    default:
      // metacognitive short-response — the forethought opener (and any next-step).
      return r.forethought;
  }
}

/**
 * Seed ONE demo student's completed reflection on a lesson: walk the real engine
 * turn by turn feeding the persona's answers, persist the completed session + its
 * summary + the teacher's score. This is exactly the path a live reflection takes,
 * so the seeded data is indistinguishable from a student having actually reflected.
 */
async function seedStudentReflection(
  intelligence: ReflectionIntelligence,
  intel: IntelRepos,
  base: Date,
  reflectionId: string,
  r: DemoReflection,
): Promise<void> {
  const set = await intel.questionSets.findByLesson(reflectionId);
  if (set === null) return;
  const sessionId = `${reflectionId}:${r.studentId}`;
  if ((await intel.sessions.findById(sessionId)) !== null) return; // already seeded

  const at = (min: number): Date => new Date(base.getTime() + min * 60_000);
  let session = createReflectionSession({
    id: sessionId,
    reflectionId,
    studentId: r.studentId,
    status: "active",
    startedAt: base,
    messages: [],
  });

  for (let i = 0; i < 24; i++) {
    const step = await intelligence.nextTurn({ session, questionSet: set });
    if (step.kind !== "question") break;
    const answer = demoAnswerFor(step, r);
    session = createReflectionSession({
      ...session,
      messages: [
        ...session.messages,
        createReflectionMessage({
          id: `${sessionId}-ai-${i}`,
          sessionId,
          sender: "ai",
          text: step.text,
          category: step.category,
          createdAt: at(i * 2),
        }),
        createReflectionMessage({
          id: `${sessionId}-stu-${i}`,
          sessionId,
          sender: "student",
          text: answer,
          createdAt: at(i * 2 + 1),
        }),
      ],
    });
  }

  const signals = await intelligence.extractSignals({ session });
  const summary = await intelligence.summarizeStudentReflection({ session, signals });
  await intel.studentSummaries.save(summary);

  const completed: ReflectionSession = createReflectionSession({
    ...session,
    status: "completed",
    selectedAction: r.nextStep,
    completedAt: at(50),
  });
  await intel.sessions.save(completed);

  // The teacher's later score — reality against the confidence they predicted.
  await intel.performances.save(
    createReflectionPerformance({
      reflectionId,
      studentId: r.studentId,
      score: r.score,
      recordedAt: at(60),
    }),
  );
}

/**
 * Seed the demo students' sample reflections on the demo (district-demo) lesson,
 * so a fresh in-memory demo already shows populated journeys, a class brief with
 * three students, and a real calibration spread. Left OFF the Slope lesson on
 * purpose, so starting THAT one live shows loop closure (revisiting the step above).
 */
export async function seedDemoStudentReflections(
  intelligence: ReflectionIntelligence,
  intel: IntelRepos,
  now: () => Date,
): Promise<void> {
  const base = now();
  for (const r of DEMO_REFLECTIONS) {
    await seedStudentReflection(intelligence, intel, base, DEMO_REFLECTION_ID, r);
  }
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
  // Populate the demo students' sample reflections once the lessons + question
  // sets exist (they must be approved and findable first).
  await seedDemoStudentReflections(intelligence, intel, now);
}
