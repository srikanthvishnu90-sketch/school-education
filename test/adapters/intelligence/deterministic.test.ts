import { describe, expect, it } from "vitest";

import { createLesson, type Lesson } from "@/domain/intelligence/lesson";
import { isBalancedQuestionSet } from "@/domain/intelligence/question";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";

/**
 * The deterministic AI service must produce valid, balanced, lesson-specific
 * output with zero network, so the whole product runs without a key. It reads
 * likely pressure points from the lesson (e.g. independent practice) without
 * ever deciding a student's state.
 */

const NOW = new Date("2026-02-01T09:00:00Z");
const ai = createDeterministicReflectionIntelligence({ now: () => NOW });

const lesson = (over: Partial<Lesson>): Lesson =>
  createLesson({
    id: "lesson-1",
    classId: "class-1",
    teacherId: "teacher-1",
    title: "Factoring quadratic equations",
    date: NOW,
    lessonType: "direct_instruction",
    content: "I modeled three examples, then students completed six problems.",
    objectives: [],
    standards: [],
    createdAt: NOW,
    ...over,
  });

describe("deterministic reflection intelligence", () => {
  it("analyzes a lesson into a topic + a reflection focus", async () => {
    const a = await ai.analyzeLesson({ lesson: lesson({}) });
    expect(a.topic).toBe("Factoring quadratic equations");
    expect(a.reflectionFocus.length).toBeGreaterThan(0);
    expect(a.emotionalPressurePoints.length).toBeGreaterThan(0);
    expect(a.lessonId).toBe("lesson-1");
  });

  it("surfaces the independent-practice pressure point when detected", async () => {
    const a = await ai.analyzeLesson({
      lesson: lesson({
        lessonType: "independent_practice",
        content: "Students worked independently on ten problems.",
      }),
    });
    expect(a.emotionalPressurePoints.join(" ")).toMatch(/independently/i);
    expect(a.independentApplication.length).toBeGreaterThan(0);
    expect(a.reflectionFocus).toMatch(/independent/i);
  });

  it("generates a balanced question set that references the topic", async () => {
    const a = await ai.analyzeLesson({ lesson: lesson({}) });
    const set = await ai.generateReflectionQuestions({
      analysis: a,
      depth: "standard",
      adaptiveFollowups: true,
    });
    expect(isBalancedQuestionSet(set)).toBe(true);
    expect(set.questions).toHaveLength(5);
    expect(set.maxFollowups).toBe(4);
    expect(set.questions.some((q) => q.text.includes("Factoring quadratic equations"))).toBe(
      true,
    );
    // every closed question carries options
    for (const q of set.questions) {
      if (q.format === "multiple_choice" || q.format === "multi_select") {
        expect(q.options?.length).toBeGreaterThan(0);
      }
    }
  });

  it("respects depth: shorter=4, deeper=6, and disables follow-ups when asked", async () => {
    const a = await ai.analyzeLesson({ lesson: lesson({}) });
    const shorter = await ai.generateReflectionQuestions({
      analysis: a,
      depth: "shorter",
      adaptiveFollowups: false,
    });
    const deeper = await ai.generateReflectionQuestions({
      analysis: a,
      depth: "deeper",
      adaptiveFollowups: true,
    });
    expect(shorter.questions).toHaveLength(4);
    expect(shorter.maxFollowups).toBe(0);
    expect(deeper.questions).toHaveLength(6);
    expect(isBalancedQuestionSet(shorter)).toBe(true);
    expect(isBalancedQuestionSet(deeper)).toBe(true);
  });
});
