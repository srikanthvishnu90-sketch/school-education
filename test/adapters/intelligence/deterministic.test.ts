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
    tenantId: "district-demo",
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

  it("keeps the teacher's most recent lesson episode for question anchoring", async () => {
    const a = await ai.analyzeLesson({
      lesson: lesson({
        content:
          "I modeled two examples. Then students compared two solution methods in writing.",
      }),
    });
    expect(a.technicalSteps).toEqual([
      "students compared two solution methods in writing",
    ]);
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

  it("generates a balanced, episode-anchored question set from teacher output", async () => {
    const objective = "Factor a quadratic using the box method";
    const a = await ai.analyzeLesson({
      lesson: lesson({ objectives: [objective] }),
    });
    const set = await ai.generateReflectionQuestions({
      analysis: a,
      depth: "standard",
      adaptiveFollowups: true,
    });
    expect(isBalancedQuestionSet(set)).toBe(true);
    expect(set.questions).toHaveLength(5);
    expect(set.maxFollowups).toBe(4);
    expect(
      set.questions.some((q) =>
        q.text.includes("Factoring quadratic equations"),
      ),
    ).toBe(true);
    expect(
      set.questions
        .slice(0, 4)
        .every((q) => q.text.includes("students completed six problems")),
    ).toBe(true);

    // Every closed question makes uncertainty an honest selectable response.
    const closedFormats = new Set([
      "multiple_choice",
      "rating",
      "emotion_select",
      "confidence_slider",
      "multi_select",
    ]);
    for (const q of set.questions) {
      if (closedFormats.has(q.format)) {
        expect(q.options?.length).toBeGreaterThan(0);
        expect(q.options).toContain("I'm not sure");
      }

      // Prompts reconstruct a task episode; they do not label the child, assume
      // difficulty/emotion, or invite a yes/no compliance answer.
      expect(q.text.toLowerCase()).not.toMatch(
        /\b(good at|bad at|smart|dumb|stupid|gifted|math person)\b/,
      );
      expect(q.text).not.toMatch(
        /^(are|can|could|did|do|does|had|has|have|is|was|were|will|would)\b/i,
      );
      expect(q.text.toLowerCase()).not.toMatch(
        /\bwhen you (got stuck|were confused|felt frustrated)\b/,
      );
      expect(q.text.match(/\?/g)).toHaveLength(1);
    }

    // The prediction is the rating question (order 0 is now the metacognitive
    // forethought opener, so category alone no longer identifies it).
    const prediction = set.questions.find((q) => q.format === "rating");
    expect(prediction).toMatchObject({
      order: 4,
      category: "metacognitive",
      format: "rating",
      required: false,
    });
    expect(prediction?.text).toMatch(/predict/i);
    expect(prediction?.text).toContain(objective);
    expect(prediction?.options).toEqual([
      "Not at all",
      "A little",
      "Somewhat",
      "Mostly",
      "Completely",
      "I'm not sure",
    ]);
  });

  it("closes with an exemplar-grounded self-compare when a worked example is given", async () => {
    const analysis = await ai.analyzeLesson({
      lesson: lesson({
        exemplar:
          "Find two numbers that multiply to 6 and add to 5 (2 and 3): (x+2)(x+3).",
      }),
    });
    const set = await ai.generateReflectionQuestions({
      analysis,
      depth: "deeper",
      adaptiveFollowups: true,
    });
    const last = set.questions[set.questions.length - 1];
    // The final beat carries the exemplar as structured data (shown as a reference
    // panel) and asks the student to compare — feedback AFTER their own attempt.
    expect(last?.text.toLowerCase()).toContain("compare your work");
    expect(last?.exemplar).toContain("multiply to 6");
  });

  it("uses the generic feed-forward when no worked example is given", async () => {
    const analysis = await ai.analyzeLesson({ lesson: lesson({}) });
    const set = await ai.generateReflectionQuestions({
      analysis,
      depth: "deeper",
      adaptiveFollowups: true,
    });
    const last = set.questions[set.questions.length - 1];
    expect(last?.exemplar).toBeUndefined();
    expect(last?.text.toLowerCase()).toContain("one small step");
  });

  it("changes prompts when the teacher's objective changes, even for the same topic", async () => {
    const first = await ai.analyzeLesson({
      lesson: lesson({ objectives: ["Factor using the box method"] }),
    });
    const second = await ai.analyzeLesson({
      lesson: lesson({ objectives: ["Check factors by multiplying them"] }),
    });
    const firstSet = await ai.generateReflectionQuestions({
      analysis: first,
      depth: "standard",
      adaptiveFollowups: true,
    });
    const secondSet = await ai.generateReflectionQuestions({
      analysis: second,
      depth: "standard",
      adaptiveFollowups: true,
    });

    expect(firstSet.questions.map((q) => q.text)).not.toEqual(
      secondSet.questions.map((q) => q.text),
    );
    expect(firstSet.questions[4]?.text).toContain("box method");
    expect(secondSet.questions[4]?.text).toContain("multiplying them");
  });

  it("does not repeat trait or leading language from teacher-authored context", async () => {
    const analysis = await ai.analyzeLesson({
      lesson: lesson({
        content: "Students were confused and failed at the final example?",
        objectives: ["Are students good at factoring?"],
      }),
    });
    const set = await ai.generateReflectionQuestions({
      analysis,
      depth: "standard",
      adaptiveFollowups: true,
    });

    for (const question of set.questions) {
      expect(question.text.toLowerCase()).not.toMatch(
        /\b(good at|bad at|were confused|failed at)\b/,
      );
      expect(question.text.match(/\?/g)).toHaveLength(1);
    }
    expect(set.questions[0]?.text).toContain("Factoring quadratic equations");
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
    // The rating prediction (order 4) is dropped from a SHORTER set and present in
    // a DEEPER one. (Both open on the metacognitive forethought question at order 0,
    // so category no longer distinguishes the prediction — its rating format does.)
    expect(shorter.questions.some((q) => q.format === "rating")).toBe(false);
    expect(deeper.questions.some((q) => q.format === "rating")).toBe(true);
    expect(shorter.questions[0]?.category).toBe("metacognitive");
    expect(deeper.questions[5]?.category).toBe("metacognitive");
  });
});
