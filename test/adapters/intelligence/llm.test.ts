import { describe, expect, it } from "vitest";

import { createLesson, type Lesson } from "@/domain/intelligence/lesson";
import { isBalancedQuestionSet } from "@/domain/intelligence/question";
import { createFakeGateway, type GatewayRequest } from "@/adapters/language/gateway";
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
const deterministic = createDeterministicReflectionIntelligence({ now: () => NOW });

const lesson = (): Lesson =>
  createLesson({
    id: "lesson-9",
    classId: "c",
    teacherId: "t",
    title: "Balancing chemical equations",
    date: NOW,
    lessonType: "direct_instruction",
    content: "Students balanced ten equations independently after two examples.",
    objectives: [],
    standards: [],
    createdAt: NOW,
  });

function intel(responder: (r: GatewayRequest) => string) {
  const gateway = createFakeGateway(responder, { models: PINNED_MODELS, now: () => NOW });
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
  { category: "technical", text: "Where did balancing get hard?", format: "long_response" },
  { category: "emotional", text: "How did you feel?", format: "emotion_select", options: ["calm", "rushed"] },
  { category: "behavioral", text: "What did you do when stuck?", format: "multiple_choice", options: ["asked", "waited"] },
  { category: "metacognitive", text: "What would you change?", format: "short_response" },
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
    expect(set.questions).toHaveLength(4);
    expect(set.questions.filter((q) => q.required)).toHaveLength(2); // 1 tech + 1 emo
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
        tasks: { analyze: false, generate: false, converse: false, signals: false, summarize: false },
      },
    });
    const a = await ai.analyzeLesson({ lesson: lesson() });
    expect(a.topic).toBe("Balancing chemical equations");
    expect(gateway.audit()).toHaveLength(0); // no model call made
  });
});
