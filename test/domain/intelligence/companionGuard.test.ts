import { describe, expect, it } from "vitest";

import {
  COMPANION_BANNED_PATTERNS,
  containsCompanionLanguage,
} from "@/domain/intelligence/companionGuard";
import { createLesson, type Lesson } from "@/domain/intelligence/lesson";
import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionMessage,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import type { ConversationStep } from "@/domain/ports/intelligence";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";

/**
 * The companion-language guard is plumb's "instrument, not companion" rule made
 * executable. This suite has three jobs:
 *  (a) UNIT — the guard flags first-person emotional/relationship claims and
 *      leaves the real, task-focused question stems and disclosure copy alone.
 *  (b) GENERATIVE EVAL — drive the deterministic engine end to end and prove
 *      that nothing it emits (analysis-anchored questions, loop closure, the
 *      clarifying follow-up) ever reads as a companion.
 *  (c) STANDING COPY — the exact student-facing safety/disclosure strings and
 *      the CourseChat opener carry no banned phrase, so the surfaces a child
 *      actually sees stay instrumental.
 */

// --- (a) unit: positives (must be flagged) -----------------------------------

const BANNED: readonly string[] = [
  "I'm so proud of you!",
  "I'm really proud of you for sticking with it.",
  "I missed you today.",
  "I've missed you so much since last time.",
  "I love you, buddy.",
  "Love you! See you tomorrow.",
  "As your friend, I think you did great.",
  "I'm your friend — you can tell me anything.",
  "We're friends now, right?",
  "You and I are best friends.",
  "I'm always here for you.",
  "Don't worry, I'm always here whenever you need me.",
  "I feel so happy seeing your work.",
  "I'm so happy for you!",
  "I care about you so much.",
  "I believe in you!",
  "You can always talk to me when you're feeling down.",
  "I've got you — don't worry.",
  "You can count on me.",
];

// --- (a) unit: negatives (must be allowed) -----------------------------------
// These include the ACTUAL task-focused stems the deterministic engine emits,
// which brush against the surface words ("a friend", "your own", "feel") that a
// naive guard would over-match.

const ALLOWED: readonly string[] = [
  "In your own words, how would you do one example, step by step, so a friend could follow it?",
  "In your own words, how would you work through one example, step by step, so someone else could follow it?",
  "Thinking about this part of today's lesson, how did that part feel? Use your own words.",
  "As you worked through today's lesson, which feeling was strongest, and did it shift at any point?",
  "When a step got tricky, what did you do next, and what made you try that?",
  "Before seeing your score or an answer key, how much of that work do you predict you completed correctly?",
  "Compare your work to this example. What is one step you'd do differently next time?",
  "Name one thing from today that clicked and one thing that felt tricky.",
  "Your answers don't change your score. Teachers see a summary, not this chat.",
  "A counselor at your school has been notified and can reach out to you.",
  "Someone will check in with you soon.",
  "I'm not sure",
];

describe("companionGuard — unit", () => {
  it("exposes a non-empty, frozen-in-intent readonly pattern list", () => {
    expect(COMPANION_BANNED_PATTERNS.length).toBeGreaterThanOrEqual(15);
    for (const pattern of COMPANION_BANNED_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
      expect(pattern.flags).toContain("i");
    }
  });

  it.each(BANNED)("flags companion language: %j", (text) => {
    expect(containsCompanionLanguage(text)).toBe(true);
  });

  it.each(ALLOWED)("allows task-focused / instrumental copy: %j", (text) => {
    expect(containsCompanionLanguage(text)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(containsCompanionLanguage("I'M SO PROUD OF YOU")).toBe(true);
    expect(containsCompanionLanguage("i love you")).toBe(true);
  });

  it("does not match the bare word 'friend' used as an explanation audience", () => {
    expect(
      containsCompanionLanguage("Explain it so a friend could follow along."),
    ).toBe(false);
  });
});

// --- (b) generative eval over the deterministic engine ----------------------

const NOW = new Date("2026-04-01T00:00:00Z");

function lessonWith(overrides: Partial<Lesson> = {}): Lesson {
  return createLesson({
    id: "L",
    tenantId: "t",
    classId: "C",
    teacherId: "T",
    title: "Slope of a line",
    date: NOW,
    lessonType: "independent_practice",
    content: "Students found slope independently after two worked examples.",
    objectives: [],
    standards: [],
    createdAt: NOW,
    ...overrides,
  });
}

const session = (
  texts: string[],
  carriedAction?: string,
): ReflectionSession =>
  createReflectionSession({
    id: "S",
    reflectionId: "R",
    studentId: "STU",
    status: "active",
    startedAt: NOW,
    ...(carriedAction !== undefined ? { carriedAction } : {}),
    messages: texts.map((text, i): ReflectionMessage =>
      createReflectionMessage({
        id: `m${i}`,
        sessionId: "S",
        sender: "student",
        text,
        createdAt: NOW,
      }),
    ),
  });

/**
 * Walk the engine one turn at a time — feeding a deliberately vague answer so
 * the clarifying follow-up also fires — and collect every question the student
 * would read, including the loop-closure opener when a step was carried in.
 */
async function collectEngineQuestionText(
  carriedAction?: string,
): Promise<string[]> {
  const ai = createDeterministicReflectionIntelligence({ now: () => NOW });
  const analysis = await ai.analyzeLesson({
    lesson: lessonWith({
      objectives: ["Find the slope of a line from two points."],
      exemplar: "slope = (y2 - y1) / (x2 - x1); pick two points, then divide.",
    }),
  });
  const set = await ai.generateReflectionQuestions({
    analysis,
    depth: "deeper",
    adaptiveFollowups: true,
  });

  const texts: string[] = [];
  const answers: string[] = [];
  // Bounded walk: carried opener + primaries + clarifying follow-ups + summary.
  // "ok" is vague but NOT typed uncertainty, so once the primaries are exhausted
  // it drives the clarifying follow-up branch (exercising that emitted text too).
  for (let guardStop = 0; guardStop < 20; guardStop++) {
    const step: ConversationStep = await ai.nextTurn({
      session: session(answers, carriedAction),
      questionSet: set,
    });
    if (step.kind !== "question") break;
    texts.push(step.text);
    answers.push("ok");
  }
  return texts;
}

describe("companionGuard — generative eval over the deterministic engine", () => {
  it("emits NO companion language across depths, grade bands, and exemplar branch", async () => {
    const ai = createDeterministicReflectionIntelligence({ now: () => NOW });
    const depths = ["shorter", "standard", "deeper"] as const;
    const grades = [undefined, "k_2", "3_5", "6_8", "9_12"] as const;
    const lessons = [
      lessonWith(),
      lessonWith({ objectives: ["Explain why the method works."] }),
      lessonWith({
        exemplar: "Show the two points, then the subtraction, then divide.",
      }),
      lessonWith({ lessonType: "assessment_prep", title: "Unit review" }),
      lessonWith({ lessonType: "group_work", title: "Partner problem set" }),
    ];

    for (const lesson of lessons) {
      const analysis = await ai.analyzeLesson({ lesson });
      for (const depth of depths) {
        for (const gradeLevel of grades) {
          const set = await ai.generateReflectionQuestions({
            analysis,
            depth,
            adaptiveFollowups: true,
            ...(gradeLevel !== undefined ? { gradeLevel } : {}),
          });
          for (const q of set.questions) {
            expect(
              containsCompanionLanguage(q.text),
              `companion language in generated question: ${q.text}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("emits NO companion language while walking nextTurn to a summary", async () => {
    const texts = await collectEngineQuestionText();
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(containsCompanionLanguage(text), text).toBe(false);
    }
  });

  it("emits NO companion language on the loop-closure opener either", async () => {
    const texts = await collectEngineQuestionText(
      "Try one example with a first-step checklist",
    );
    expect(texts[0]).toContain("Last time");
    for (const text of texts) {
      expect(containsCompanionLanguage(text), text).toBe(false);
    }
  });
});

// --- (c) standing student-facing safety / disclosure copy --------------------
// Replicated verbatim from the components below (kept in sync by hand — these
// strings live inside "use client" JSX and are not exportable without a
// refactor). Sources:
//   src/app/courses/[courseId]/CourseChat.tsx  (opener, disclosure, SafetyPanel)
//   src/app/chat/[reflectionId]/ChatFlow.tsx    (disclosure banner, SafetyTurn)

const STANDING_COPY: readonly string[] = [
  // CourseChat opener (studentName/courseName interpolated with samples).
  "Hi Jordan — let's work through Algebra I. Name one thing from today that clicked and one thing that felt tricky.",
  // CourseChat standing disclosure.
  "This chat is private and never changes your score. If you mention being in danger, a counselor at your school is notified so you can get help.",
  // CourseChat crisis input placeholder.
  "Someone will check in with you soon.",
  // CourseChat SafetyPanel body.
  "What you wrote looks serious, and it shouldn't wait for an app. A counselor at your school has been notified and can reach out to you. You're not in trouble for writing it.",
  "If you might be in immediate danger, tell a nearby trusted adult or call emergency services now. In the U.S., you can also call or text 988.",
  // ChatFlow standing disclosure banner.
  "Your grade never changes. Your teacher sees how the class did and a short note so they can help — never what you typed. If you say you're in danger, a counselor at your school is told. These questions were drafted with AI and checked by your teacher before you saw them.",
  // ChatFlow SafetyTurn body (mirrors CourseChat's SafetyPanel).
  "What you wrote looks serious, and it shouldn't wait for an app. A counselor at your school has been notified and can reach out to you. You're not in trouble for writing it.",
];

describe("companionGuard — standing student-facing copy", () => {
  it.each(STANDING_COPY)(
    "standing safety/disclosure copy is instrumental, not companion: %j",
    (copy) => {
      expect(containsCompanionLanguage(copy)).toBe(false);
    },
  );
});
