import { describe, expect, it } from "vitest";

import { assessDepth } from "@/app/_world/depth";

/**
 * The depth gate is the "won't let you move on until you truly answer" rule.
 * It must block thin/empty/padded answers and pass a genuine one — deterministic,
 * with kind, basic nudges.
 */
describe("assessDepth", () => {
  it("blocks an empty answer", () => {
    expect(assessDepth("").ok).toBe(false);
    expect(assessDepth("   ").ok).toBe(false);
  });

  it("blocks a too-short answer with a gentle nudge", () => {
    const r = assessDepth("I rushed it");
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("little more");
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
