import { describe, expect, it } from "vitest";

import { gradeAnswer, normalizeAnswer } from "@/domain";

/**
 * Deterministic grading of a student's real answer — the honest basis for a real
 * outcome (never an LLM). Tolerant of the shapes math answers take; an empty
 * answer is never correct.
 */
describe("gradeAnswer", () => {
  it("accepts exact and prefixed matches", () => {
    expect(gradeAnswer("5", "5")).toBe(true);
    expect(gradeAnswer("x = 5", "5")).toBe(true);
    expect(gradeAnswer(" x=5 ", "5")).toBe(true);
    expect(gradeAnswer("slope = 3", "3")).toBe(true);
  });

  it("accepts numeric equivalence (decimals and simple fractions)", () => {
    expect(gradeAnswer("3.0", "3")).toBe(true);
    expect(gradeAnswer("6/2", "3")).toBe(true);
    expect(gradeAnswer("8/4", "2")).toBe(true);
  });

  it("rejects wrong answers and empty responses", () => {
    expect(gradeAnswer("4", "5")).toBe(false);
    expect(gradeAnswer("", "5")).toBe(false);
    expect(gradeAnswer("   ", "5")).toBe(false);
    expect(gradeAnswer("6/0", "3")).toBe(false); // no divide-by-zero pass
  });

  it("normalizes consistently", () => {
    expect(normalizeAnswer("  X = 5 ")).toBe("5");
    expect(normalizeAnswer("Slope=3")).toBe("3");
  });
});
