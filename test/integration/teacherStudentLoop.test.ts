import { describe, expect, it } from "vitest";

import { createLesson } from "@/domain/intelligence/lesson";
import {
  approveQuestionSet,
  isQuestionSetApproved,
} from "@/domain/intelligence/question";
import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";
import {
  createMemoryClassSummaryRepository,
  createMemoryLessonRepository,
  createMemoryQuestionSetRepository,
  createMemoryReflectionSessionRepository,
  createMemoryStudentSummaryRepository,
} from "@/adapters/memory/intelligenceRepositories";

/**
 * The seam between the TEACHER portal and the STUDENT portal, proven end to end in
 * one process against the real in-memory repositories + the real deterministic
 * engine (no mocks, no network): a teacher creates and APPROVES a lesson → the
 * student sees exactly that approved lesson and reflects on it → the teacher reads
 * the student's contribution back in the aggregate class brief. This is the
 * "connection working" the product depends on.
 */

const NOW = new Date("2026-07-20T12:00:00Z");
const REFLECTION_ID = "lesson-integration-1";
const STUDENT_ID = "student-avery";

function build() {
  return {
    ai: createDeterministicReflectionIntelligence({ now: () => NOW }),
    lessons: createMemoryLessonRepository(),
    questionSets: createMemoryQuestionSetRepository(),
    sessions: createMemoryReflectionSessionRepository(),
    studentSummaries: createMemoryStudentSummaryRepository(),
    classSummaries: createMemoryClassSummaryRepository(),
  };
}

/** Append an AI question then the student's answer — what the chat surface persists each turn. */
function withTurn(
  session: ReflectionSession,
  questionText: string,
  answer: string,
  i: number,
): ReflectionSession {
  const messages = [
    ...session.messages,
    createReflectionMessage({
      id: `${session.id}-ai-${i}`,
      sessionId: session.id,
      sender: "ai",
      text: questionText,
      category: "technical",
      createdAt: new Date(NOW.getTime() + i * 2_000),
    }),
    createReflectionMessage({
      id: `${session.id}-stu-${i}`,
      sessionId: session.id,
      sender: "student",
      text: answer,
      createdAt: new Date(NOW.getTime() + i * 2_000 + 1_000),
    }),
  ];
  return createReflectionSession({ ...session, messages });
}

describe("teacher ↔ student connection (end to end, in-memory)", () => {
  it("a teacher's approved lesson reaches the student, and the student's reflection reaches the teacher's brief", async () => {
    const w = build();

    // ---- TEACHER: create a lesson, let the AI draft, then APPROVE it. ----
    const lesson = createLesson({
      id: REFLECTION_ID,
      tenantId: "district-demo",
      classId: "class-1",
      teacherId: "teacher-1",
      title: "Factoring quadratic equations",
      date: NOW,
      lessonType: "independent_practice",
      content:
        "I modeled three examples, then students factored six problems on their own.",
      objectives: ["Factor a quadratic using the box method"],
      standards: [],
      createdAt: NOW,
    });
    await w.lessons.save(lesson);
    const analysis = await w.ai.analyzeLesson({ lesson });
    const draft = await w.ai.generateReflectionQuestions({
      analysis,
      depth: "standard",
      adaptiveFollowups: true,
    });

    // The gate: the AI draft is NOT approved, so the student MUST NOT see it yet.
    expect(isQuestionSetApproved(draft)).toBe(false);
    await w.questionSets.save(draft);
    const visible = await w.questionSets.findByLesson(REFLECTION_ID);
    expect(visible !== null && isQuestionSetApproved(visible)).toBe(false);

    // The teacher approves — now it opens to students.
    await w.questionSets.save(approveQuestionSet(draft, NOW));

    // ---- STUDENT: sees exactly the approved lesson and reflects on it. ----
    const set = await w.questionSets.findByLesson(REFLECTION_ID);
    expect(set).not.toBeNull();
    expect(isQuestionSetApproved(set!)).toBe(true);
    expect(set!.lessonId).toBe(REFLECTION_ID); // same lesson the teacher made

    let session = createReflectionSession({
      id: `${REFLECTION_ID}:${STUDENT_ID}`,
      reflectionId: REFLECTION_ID,
      studentId: STUDENT_ID,
      status: "active",
      startedAt: NOW,
      messages: [],
    });

    // Walk the real engine turn by turn until it decides there's enough to summarize.
    for (let i = 0; i < 20; i++) {
      const step = await w.ai.nextTurn({ session, questionSet: set! });
      if (step.kind === "summary") break;
      expect(step.kind).toBe("question");
      if (step.kind === "question") {
        session = withTurn(
          session,
          step.text,
          "It made sense during the examples, but I mixed up the middle-term sign on my own.",
          i,
        );
        await w.sessions.save(session);
      }
    }

    // Complete: extract signals, summarize, persist a completed session + summary.
    const signals = await w.ai.extractSignals({ session });
    const summary = await w.ai.summarizeStudentReflection({ session, signals });
    await w.studentSummaries.save(summary);
    const completed = createReflectionSession({
      ...session,
      status: "completed",
      selectedAction: "Redo one problem, checking the middle-term sign.",
      completedAt: new Date(NOW.getTime() + 60_000),
    });
    await w.sessions.save(completed);

    // The student's own record exists and is theirs.
    const savedSession = await w.sessions.findByReflectionAndStudent(
      REFLECTION_ID,
      STUDENT_ID,
    );
    expect(savedSession?.status).toBe("completed");
    expect(savedSession?.selectedAction).toContain("middle-term sign");
    expect(
      await w.studentSummaries.findByReflectionAndStudent(REFLECTION_ID, STUDENT_ID),
    ).not.toBeNull();

    // ---- TEACHER: reads the student's contribution back as the AGGREGATE brief. ----
    const completedForBrief = (await w.sessions.listByReflection(REFLECTION_ID)).filter(
      (s) => s.status === "completed",
    );
    expect(completedForBrief.map((s) => s.studentId)).toContain(STUDENT_ID);

    const brief = await w.ai.summarizeClassReflection({
      classId: "class-1",
      reflectionId: REFLECTION_ID,
      students: [{ studentId: STUDENT_ID, summary, signals }],
    });
    await w.classSummaries.save(brief);

    const teacherView = await w.classSummaries.findByReflection(REFLECTION_ID);
    expect(teacherView).not.toBeNull();
    expect(teacherView!.reflectionId).toBe(REFLECTION_ID); // same lesson, full circle
    // The brief is aggregate prose (understanding/feeling/behavior) — the connection
    // carried the student's participation to the teacher without exposing raw text
    // per-student here (that constraint is enforced at the query layer / buildClassBrief).
    expect(teacherView!.technicalSummary.length).toBeGreaterThan(0);
    expect(teacherView!.emotionalSummary.length).toBeGreaterThan(0);
  });
});
