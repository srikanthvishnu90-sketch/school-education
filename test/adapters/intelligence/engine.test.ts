import { describe, expect, it } from "vitest";

import { createLesson, type Lesson } from "@/domain/intelligence/lesson";
import type { ReflectionQuestionSet } from "@/domain/intelligence/question";
import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionMessage,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";

/**
 * The deterministic adaptive engine: it walks the primary questions one turn at a
 * time, asks one clarifying follow-up on a vague answer (bounded by maxFollowups),
 * ends with a summary, and — first, every turn — yields to a safety concern.
 * Safety is deterministic detection; the engine never delegates it.
 */

const NOW = new Date("2026-04-01T00:00:00Z");

const lesson: Lesson = createLesson({
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
});

async function build(safetyCheck?: (t: string) => boolean): Promise<{
  ai: ReturnType<typeof createDeterministicReflectionIntelligence>;
  set: ReflectionQuestionSet;
}> {
  const ai = createDeterministicReflectionIntelligence({
    now: () => NOW,
    safetyCheck,
  });
  const analysis = await ai.analyzeLesson({ lesson });
  const set = await ai.generateReflectionQuestions({
    analysis,
    depth: "standard",
    adaptiveFollowups: true,
  });
  return { ai, set };
}

const session = (texts: string[]): ReflectionSession =>
  createReflectionSession({
    id: "S",
    reflectionId: "R",
    studentId: "STU",
    status: "active",
    startedAt: NOW,
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

describe("deterministic adaptive engine — nextTurn", () => {
  it("asks the first primary (stage 'overall') at the start", async () => {
    const { ai, set } = await build();
    const step = await ai.nextTurn({ session: session([]), questionSet: set });
    expect(step.kind).toBe("question");
    if (step.kind === "question") {
      expect(step.stage).toBe("overall");
      expect(step.text).toContain("Slope of a line");
      expect(step.required).toBe(true);
    }
  });

  it("ends with a summary once all primaries are answered substantively", async () => {
    const { ai, set } = await build();
    const answers = set.questions.map(
      () => "It made sense until I had to pick the method myself.",
    );
    const step = await ai.nextTurn({
      session: session(answers),
      questionSet: set,
    });
    expect(step.kind).toBe("summary");
  });

  it("asks one clarifying follow-up when the last answer is vague", async () => {
    const { ai, set } = await build();
    const answers = set.questions.map((_, i) =>
      i === set.questions.length - 1 ? "maybe" : "real answer here",
    );
    const step = await ai.nextTurn({
      session: session(answers),
      questionSet: set,
    });
    expect(step.kind).toBe("question");
    if (step.kind === "question") {
      expect(step.stage).toBe("support");
      expect(step.required).toBe(false);
    }
    // ...and after the follow-up is answered, it summarizes.
    const after = await ai.nextTurn({
      session: session([...answers, "It was choosing which formula to use."]),
      questionSet: set,
    });
    expect(after.kind).toBe("summary");
  });

  it("accepts the offered uncertainty choice without treating it as missing detail", async () => {
    const { ai, set } = await build();
    const answers = set.questions.map((_, i) =>
      i === set.questions.length - 1
        ? "I'm not sure"
        : "A concrete answer about today's task",
    );
    const step = await ai.nextTurn({
      session: session(answers),
      questionSet: set,
    });
    expect(step.kind).toBe("summary");
  });

  it.each(["I don't know", "idk", "No idea", "I'm not sure yet"])(
    "accepts typed uncertainty %j without repeated follow-ups",
    async (uncertain) => {
      const { ai, set } = await build();
      const answers = set.questions.map((_, i) =>
        i === set.questions.length - 1
          ? uncertain
          : "A concrete answer about today's task",
      );

      await expect(
        ai.nextTurn({ session: session(answers), questionSet: set }),
      ).resolves.toMatchObject({ kind: "summary" });
    },
  );

  it("yields to a safety concern before anything else", async () => {
    const { ai, set } = await build((t) => /hurt myself/i.test(t));
    const step = await ai.nextTurn({
      session: session(["everything", "i want to hurt myself"]),
      questionSet: set,
    });
    expect(step.kind).toBe("safety");
  });
});

describe("deterministic signal extraction", () => {
  it("tags technical, emotional, behavioral, and context signals from the chat", async () => {
    const { ai } = await build();
    const signals = await ai.extractSignals({
      session: session([
        "It made sense during examples but I didn't know which method to use on my own.",
        "I felt embarrassed and I waited instead of asking for help.",
      ]),
    });
    expect(signals.technical).toContain("understood_concept");
    expect(signals.technical).toContain("application_difficulty");
    expect(signals.emotional).toContain("embarrassed");
    expect(signals.behavioral).toContain("avoided_help");
    expect(signals.context).toContain("independent_work");
  });
});
