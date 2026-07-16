import { describe, it, expect } from "vitest";
import { buildFactoringSurvey } from "./factoringSurvey";
import { isBalancedQuestionSet } from "@/domain/intelligence/question";
import { reviewQuestion } from "@/domain/intelligence/questionDesign";

/** Deterministic PRNG so these tests are stable despite the builder's randomness. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = () => new Date("2026-07-10T09:00:00Z");

describe("buildFactoringSurvey", () => {
  it("produces a valid, balanced set of the requested size", () => {
    const set = buildFactoringSurvey("lesson-demo", NOW, mulberry32(1), 5);
    expect(set.questions).toHaveLength(5);
    expect(isBalancedQuestionSet(set)).toBe(true);
    const categories = set.questions.map((q) => q.category);
    expect(categories).toContain("technical");
    expect(categories).toContain("emotional");
  });

  it("always opens technical, then emotional (keeps the balance invariant)", () => {
    for (const seed of [1, 7, 42, 99, 1000]) {
      const set = buildFactoringSurvey("lesson-demo", NOW, mulberry32(seed));
      expect(set.questions[0].category).toBe("technical");
      expect(set.questions[1].category).toBe("emotional");
    }
  });

  it("clamps the count to 4–6", () => {
    expect(buildFactoringSurvey("l", NOW, mulberry32(2), 1).questions.length).toBe(4);
    expect(buildFactoringSurvey("l", NOW, mulberry32(2), 9).questions.length).toBe(6);
  });

  it("always closes with the outside-of-class question", () => {
    for (const seed of [1, 7, 42]) {
      const set = buildFactoringSurvey("l", NOW, mulberry32(seed));
      const last = set.questions[set.questions.length - 1];
      expect(last.text.toLowerCase()).toContain("outside of class");
    }
  });

  it("every generated question complies with the research design rules", () => {
    for (const seed of [1, 3, 7, 42, 99, 500, 1234]) {
      const set = buildFactoringSurvey("l", NOW, mulberry32(seed), 6);
      for (const q of set.questions) {
        const review = reviewQuestion(q.text);
        expect(review.issues, `"${q.text}" → ${review.issues.join(", ")}`).toEqual([]);
      }
    }
  });

  it("varies the questions across different random draws", () => {
    const a = buildFactoringSurvey("l", NOW, mulberry32(1)).questions.map((q) => q.text);
    const b = buildFactoringSurvey("l", NOW, mulberry32(500)).questions.map((q) => q.text);
    expect(a).not.toEqual(b);
  });

  it("is about factoring and carries options for choice questions", () => {
    const set = buildFactoringSurvey("l", NOW, mulberry32(3), 6);
    const blob = set.questions.map((q) => q.text).join(" ").toLowerCase();
    expect(blob).toContain("factor");
    for (const q of set.questions) {
      if (q.format === "multiple_choice") {
        expect(q.options && q.options.length).toBeGreaterThan(0);
      }
    }
  });
});
