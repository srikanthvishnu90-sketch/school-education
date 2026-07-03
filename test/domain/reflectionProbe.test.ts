import { describe, expect, it } from "vitest";

import { buildReflectionProbes, MAX_ITEM_PROBES, type WrongItem } from "@/domain";

/**
 * Reflection probes are FORMULATED from the teacher's exam items and always read
 * as task-focused, detailed, free-response questions. The domain decides which
 * questions; a passthrough render proves selection never depends on phrasing.
 */

// Deterministic slot fill, matching LanguageCapability.renderQuestion's contract.
const render = (t: string, s: Readonly<Record<string, string>>): string =>
  t.replace(/\{(\w+)\}/g, (whole, k: string) =>
    Object.prototype.hasOwnProperty.call(s, k) ? s[k] : whole,
  );

const wrong = (prompt: string, skillName: string): WrongItem => ({ prompt, skillName });

describe("buildReflectionProbes", () => {
  it("walks each missed item (what happened), then per-skill why, then synthesis", () => {
    const { probes, truncated } = buildReflectionProbes(
      [
        wrong("Solve 3x + 5 = 20.", "linear equations"),
        wrong("Find the slope through (1, 2) and (3, 8).", "interpreting slope"),
      ],
      render,
    );

    expect(truncated).toBe(false);
    const kinds = probes.map((p) => p.kind);
    // two what_happened, two why_wrong (distinct skills), one synthesis.
    expect(kinds).toEqual([
      "what_happened",
      "what_happened",
      "why_wrong",
      "why_wrong",
      "synthesis",
    ]);
    // The actual exam prompt is carried into the question (formulated from it).
    expect(probes[0].question).toContain("Solve 3x + 5 = 20.");
    // Detailed: every probe demands real depth.
    expect(probes.every((p) => p.minWords >= 15)).toBe(true);
  });

  it("collapses repeated skills to one why probe", () => {
    const { probes } = buildReflectionProbes(
      [wrong("Solve 3x + 5 = 20.", "linear equations"), wrong("Solve 2(x-4)=10.", "linear equations")],
      render,
    );
    expect(probes.filter((p) => p.kind === "why_wrong")).toHaveLength(1);
  });

  it("caps individual item probes and reports truncation", () => {
    const items = Array.from({ length: MAX_ITEM_PROBES + 3 }, (_, i) =>
      wrong(`Q${i}`, "factoring"),
    );
    const { probes, truncated } = buildReflectionProbes(items, render);
    expect(probes.filter((p) => p.kind === "what_happened")).toHaveLength(
      MAX_ITEM_PROBES,
    );
    expect(truncated).toBe(true);
  });

  it("still reflects on the whole process when nothing was missed (awareness > score)", () => {
    const { probes } = buildReflectionProbes([], render);
    expect(probes).toHaveLength(2);
    expect(probes.map((p) => p.kind)).toEqual(["what_happened", "synthesis"]);
  });

  it("never phrases a probe about the student as a person", () => {
    const { probes } = buildReflectionProbes(
      [wrong("Solve 3x + 5 = 20.", "linear equations")],
      render,
    );
    for (const p of probes) {
      expect(p.question.toLowerCase()).not.toMatch(/\b(bad at|smart|dumb|stupid|gifted)\b/);
    }
  });
});
