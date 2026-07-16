import { describe, expect, it } from "vitest";

import { createLesson, type Lesson } from "@/domain/intelligence/lesson";
import { isBalancedQuestionSet } from "@/domain/intelligence/question";
import {
  createFakeGateway,
  type GatewayRequest,
} from "@/adapters/language/gateway";
import { PINNED_MODELS } from "@/adapters/language/models";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";
import { createLlmReflectionIntelligence } from "@/adapters/intelligence/llm";

/**
 * The LLM adapter is proven with a FAKE gateway — no network, no key. Two things
 * must hold: valid model JSON is accepted (and reaches the domain through the
 * strict factory), and ANY bad output (garbage, unbalanced, off-schema) silently
 * falls back to the deterministic adapter, so the product never breaks on the AI.
 */

const NOW = new Date("2026-03-01T00:00:00Z");
const deterministic = createDeterministicReflectionIntelligence({
  now: () => NOW,
});

const lesson = (over: Partial<Lesson> = {}): Lesson =>
  createLesson({
    id: "lesson-9",
    classId: "c",
    teacherId: "t",
    title: "Balancing chemical equations",
    date: NOW,
    lessonType: "direct_instruction",
    content:
      "Students balanced ten equations independently after two examples.",
    objectives: ["Balance a chemical equation without a worked example"],
    standards: [],
    createdAt: NOW,
    ...over,
  });

function intel(responder: (r: GatewayRequest) => string) {
  const gateway = createFakeGateway(responder, {
    models: PINNED_MODELS,
    now: () => NOW,
  });
  return createLlmReflectionIntelligence({
    gateway,
    fallback: deterministic,
    now: () => NOW,
  });
}

const VALID_ANALYSIS = JSON.stringify({
  topic: "Balancing chemical equations",
  emotionalPressurePoints: ["Students may feel rushed when balancing alone."],
  reflectionFocus: "Independent balancing and asking for help.",
});

const VALID_QUESTIONS = JSON.stringify([
  {
    category: "technical",
    text: "Thinking about the equations you balanced today, which moment is closest to what happened?",
    format: "multiple_choice",
    options: ["I started", "I checked an example", "I'm not sure"],
  },
  {
    category: "emotional",
    text: "At that moment in today's balancing task, which feeling was closest to what you noticed?",
    format: "emotion_select",
    options: ["Calm", "Rushed", "I'm not sure"],
  },
  {
    category: "technical",
    text: "Pick one equation from today's balancing task. What was the last step you could explain in your own words?",
    format: "short_response",
  },
  {
    category: "behavioral",
    text: "Right after that step in today's balancing task, what did you do next?",
    format: "multiple_choice",
    options: ["Asked for help", "Used an example", "I'm not sure"],
  },
  {
    category: "metacognitive",
    text: "Before seeing your score for today's balancing task, how much do you predict you completed correctly?",
    format: "rating",
    options: [
      "Not at all",
      "A little",
      "Somewhat",
      "Mostly",
      "Completely",
      "I'm not sure",
    ],
  },
]);

describe("LLM reflection intelligence (fake gateway)", () => {
  it("accepts valid model JSON for analysis", async () => {
    const ai = intel(() => VALID_ANALYSIS);
    const a = await ai.analyzeLesson({ lesson: lesson() });
    expect(a.topic).toBe("Balancing chemical equations");
    expect(a.reflectionFocus).toMatch(/asking for help/i);
    expect(a.lessonId).toBe("lesson-9"); // domain adds this, not the model
  });

  it("falls back to deterministic on garbage analysis output", async () => {
    const ai = intel(() => "not json at all");
    const a = await ai.analyzeLesson({ lesson: lesson() });
    // deterministic topic == the lesson title, plus its independent-practice point
    expect(a.topic).toBe("Balancing chemical equations");
    expect(a.emotionalPressurePoints.join(" ")).toMatch(/independently/i);
  });

  it("accepts valid model JSON for questions and enforces balance", async () => {
    const ai = intel(() => VALID_QUESTIONS);
    const analysis = await deterministic.analyzeLesson({ lesson: lesson() });
    const set = await ai.generateReflectionQuestions({
      analysis,
      depth: "standard",
      adaptiveFollowups: true,
    });
    expect(isBalancedQuestionSet(set)).toBe(true);
    expect(set.questions).toHaveLength(5);
    expect(set.questions.filter((q) => q.required)).toHaveLength(2); // 1 tech + 1 emo
    expect(set.questions[4]).toMatchObject({
      category: "metacognitive",
      format: "rating",
      required: false,
    });
  });

  it("accepts the deeper metacognitive feed-forward prompt", async () => {
    const questions = JSON.parse(VALID_QUESTIONS) as Record<string, unknown>[];
    questions.push({
      category: "metacognitive",
      text: "For the next balancing equation, what is one small step you would try first?",
      format: "short_response",
    });
    const ai = intel(() => JSON.stringify(questions));
    const analysis = await deterministic.analyzeLesson({ lesson: lesson() });

    const set = await ai.generateReflectionQuestions({
      analysis,
      depth: "deeper",
      adaptiveFollowups: true,
    });

    expect(set.questions[5]).toMatchObject({
      category: "metacognitive",
      text: questions[5]?.text,
      format: "short_response",
    });
  });

  it("sends the teacher objective, recent task, and requested depth to generation", async () => {
    let request: GatewayRequest | undefined;
    const ai = intel((candidate) => {
      request = candidate;
      return VALID_QUESTIONS;
    });
    const analysis = await deterministic.analyzeLesson({ lesson: lesson() });
    await ai.generateReflectionQuestions({
      analysis,
      depth: "standard",
      adaptiveFollowups: true,
    });

    expect(request?.task).toBe("generate");
    const payload = JSON.parse(request?.prompt ?? "{}") as Record<
      string,
      unknown
    >;
    expect(payload.objectives).toEqual([
      "Balance a chemical equation without a worked example",
    ]);
    expect(payload.recentTask).toBe(
      "Students balanced ten equations independently after two examples",
    );
    expect(payload.depth).toBe("standard");
    expect(payload.questionCount).toBe(5);
  });

  it.each([
    {
      failure: "trait and leading wording",
      mutate: (questions: Record<string, unknown>[]) => {
        questions[3] = {
          ...questions[3],
          text: "When you got stuck balancing equations today, are you bad at chemistry?",
        };
      },
    },
    {
      failure: "a technical prompt rewritten as an emotion question",
      mutate: (questions: Record<string, unknown>[]) => {
        questions[0] = {
          ...questions[0],
          text: "How did today's balancing task feel?",
        };
      },
    },
    {
      failure: "a closed response without honest uncertainty",
      mutate: (questions: Record<string, unknown>[]) => {
        questions[1] = { ...questions[1], options: ["Calm", "Rushed"] };
      },
    },
    {
      failure: "an unanchored generic prompt",
      mutate: (questions: Record<string, unknown>[]) => {
        questions[2] = {
          ...questions[2],
          text: "What was the last step you could explain in your own words?",
        };
      },
    },
    {
      failure: "a prediction that cannot produce a supported scale value",
      mutate: (questions: Record<string, unknown>[]) => {
        questions[4] = {
          ...questions[4],
          format: "short_response",
          options: undefined,
        };
      },
    },
    {
      failure: "a standard set without its metacognitive prediction",
      mutate: (questions: Record<string, unknown>[]) => {
        questions.splice(4);
      },
    },
  ])("falls back on $failure", async ({ mutate }) => {
    const questions = JSON.parse(VALID_QUESTIONS) as Record<string, unknown>[];
    mutate(questions);
    const ai = intel(() => JSON.stringify(questions));
    const analysis = await deterministic.analyzeLesson({ lesson: lesson() });
    const set = await ai.generateReflectionQuestions({
      analysis,
      depth: "standard",
      adaptiveFollowups: true,
    });

    expect(set.questions[0]?.text).toContain("this part of today's lesson");
    expect(set.questions[4]).toMatchObject({
      category: "metacognitive",
      format: "rating",
    });
  });

  it("falls back when the model returns an unbalanced set (no emotional)", async () => {
    const allTechnical = JSON.stringify(
      Array.from({ length: 4 }, (_, i) => ({
        category: "technical",
        text: `q${i}`,
        format: "short_response",
      })),
    );
    const ai = intel(() => allTechnical);
    const analysis = await deterministic.analyzeLesson({ lesson: lesson() });
    const set = await ai.generateReflectionQuestions({
      analysis,
      depth: "standard",
      adaptiveFollowups: false,
    });
    // deterministic fallback is always balanced
    expect(isBalancedQuestionSet(set)).toBe(true);
    expect(set.questions.some((q) => q.category === "emotional")).toBe(true);
  });

  it("uses the deterministic fallback entirely when the task is disabled", async () => {
    const gateway = createFakeGateway(
      () => {
        throw new Error("gateway should not be called");
      },
      { models: PINNED_MODELS, now: () => NOW },
    );
    const ai = createLlmReflectionIntelligence({
      gateway,
      fallback: deterministic,
      now: () => NOW,
      config: {
        tasks: {
          analyze: false,
          generate: false,
          converse: false,
          signals: false,
          summarize: false,
        },
      },
    });
    const a = await ai.analyzeLesson({ lesson: lesson() });
    expect(a.topic).toBe("Balancing chemical equations");
    expect(gateway.audit()).toHaveLength(0); // no model call made
  });
});
