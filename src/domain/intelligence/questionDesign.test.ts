import { describe, it, expect } from "vitest";
import {
  reviewQuestion,
  QUESTION_DESIGN_PRINCIPLES,
  AGE_BAND_FORMATS,
  HIGH_SCHOOL_BAND,
  type DesignIssue,
} from "./questionDesign";

function issues(text: string): DesignIssue[] {
  return reviewQuestion(text).issues;
}

describe("reviewQuestion — flags the research anti-patterns", () => {
  it("flags leading questions (suggestibility)", () => {
    expect(issues("Factoring was easy today, right?")).toContain("leading");
    expect(issues("Obviously you understood the lesson?")).toContain("leading");
  });

  it("flags double-barreled questions", () => {
    expect(issues("Do you like reading and writing?")).toContain("double_barreled");
  });

  it("flags abstract-trait questions (ask about a moment instead)", () => {
    expect(issues("Are you good at math?")).toContain("abstract_trait");
    expect(issues("Are you a hard worker?")).toContain("abstract_trait");
    expect(issues("How good are you at factoring?")).toContain("abstract_trait");
  });

  it("flags yes/no framing for a judgment (acquiescence)", () => {
    expect(issues("Did the lesson make sense? (yes/no)")).toContain("yes_no");
  });

  it("flags over-long prompts", () => {
    expect(issues("x".repeat(200))).toContain("too_long");
  });
});

describe("reviewQuestion — passes well-formed reflection questions", () => {
  const good = [
    "How clear did today's work on factoring feel overall?",
    "Which word best fits how you felt working on factoring today?",
    "Where did factoring stop making sense — walk me through the moment it got hard.",
    "When you got stuck, what did you do?",
    "What is one thing you would do differently next time?",
    "For x² + 5x + 6, how would you find the two numbers that work?",
    "Last one — did anything outside of class make it harder to focus or learn today?",
  ];
  for (const q of good) {
    it(`no issues: "${q.slice(0, 40)}…"`, () => {
      expect(reviewQuestion(q).ok).toBe(true);
    });
  }
});

describe("principles and age bands", () => {
  it("carries the research principles with citations", () => {
    expect(QUESTION_DESIGN_PRINCIPLES.length).toBeGreaterThanOrEqual(8);
    for (const p of QUESTION_DESIGN_PRINCIPLES) {
      expect(p.rule.length).toBeGreaterThan(0);
      expect(p.cite.length).toBeGreaterThan(0);
    }
    const ids = QUESTION_DESIGN_PRINCIPLES.map((p) => p.id);
    expect(ids).toContain("episodic");
    expect(ids).toContain("privacy");
    expect(ids).toContain("predict-then-check");
  });

  it("defaults to the high-school band (5-point scales)", () => {
    expect(HIGH_SCHOOL_BAND.ages).toBe("14–18");
    expect(HIGH_SCHOOL_BAND.maxScalePoints).toBe(5);
    expect(AGE_BAND_FORMATS[0].maxScalePoints).toBeLessThan(HIGH_SCHOOL_BAND.maxScalePoints);
  });
});
