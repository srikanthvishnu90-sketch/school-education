import { describe, expect, it } from "vitest";

import { assessDepth } from "@/app/_world/depth";

/**
 * The gate is "the question is answered", not "the answer is long enough". There
 * is no right or wrong answer: any genuine attempt in the student's own words
 * passes and they move on. It blocks only blanks, filler non-answers, one word,
 * and padding — with kind, basic nudges.
 */
describe("assessDepth", () => {
  it("blocks an empty answer", () => {
    expect(assessDepth("").ok).toBe(false);
    expect(assessDepth("   ").ok).toBe(false);
  });

  it("passes a short but genuine answer (no length target)", () => {
    const r = assessDepth("I rushed the last step");
    expect(r.ok).toBe(true);
    expect(r.hint).toBeNull();
  });

  it("blocks a filler non-answer, inviting the real one without judging it", () => {
    for (const filler of ["idk", "I don't know", "nothing", "n/a"]) {
      const r = assessDepth(filler);
      expect(r.ok).toBe(false);
      expect(r.hint).toMatch(/no right one|honest answer/);
    }
  });

  it("blocks a single word (not yet an answer) with a gentle nudge", () => {
    const r = assessDepth("rushed");
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("own words");
  });

  it("blocks padded repetition even when long", () => {
    const r = assessDepth(
      "because because because because because because because because because because because because",
    );
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("own words");
  });

  it("passes a genuine, detailed answer", () => {
    const r = assessDepth(
      "I thought I understood slope but I mixed up rise and run, so I set the fraction upside down and got it wrong.",
    );
    expect(r.ok).toBe(true);
    expect(r.hint).toBeNull();
  });
});
