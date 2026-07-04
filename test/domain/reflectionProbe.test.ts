import { describe, expect, it } from "vitest";

import {
  buildReflectionProbes,
  derivePriorContext,
  EMPTY_PRIOR_CONTEXT,
  MAX_ITEM_PROBES,
  type AttributionCategory,
  type Reflection,
  type WrongItem,
} from "@/domain";

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

// --- Personalization from prior data ---------------------------------------

const reflection = (
  overrides: {
    category?: AttributionCategory;
    action?: string;
    at: string;
    controllable?: boolean;
    specific?: boolean;
  },
): Reflection => ({
  id: `r-${overrides.at}`,
  assessmentId: "a-prior",
  studentId: "s-1",
  attribution: {
    category: overrides.category ?? "strategy",
    specific: overrides.specific ?? true,
    controllable: overrides.controllable ?? true,
    note: "n",
  },
  nextAction: { text: overrides.action ?? "do the thing", dueBy: new Date(overrides.at) },
  exemplarReviewed: true,
  createdAt: new Date(overrides.at),
});

describe("derivePriorContext", () => {
  it("returns the empty context when there is no history", () => {
    expect(derivePriorContext([])).toEqual(EMPTY_PRIOR_CONTEXT);
  });

  it("takes the MOST RECENT committed action as the follow-through anchor", () => {
    const ctx = derivePriorContext([
      reflection({ at: "2026-01-01", action: "write out every step" }),
      reflection({ at: "2026-03-01", action: "sketch the graph first" }),
    ]);
    expect(ctx.lastAction).toBe("sketch the graph first");
    expect(ctx.priorCycles).toBe(2);
  });

  it("strips trailing punctuation so the template supplies the only period", () => {
    const ctx = derivePriorContext([
      reflection({ at: "2026-03-01", action: "check each answer by substituting it back in." }),
    ]);
    expect(ctx.lastAction).toBe("check each answer by substituting it back in");
    const { probes } = buildReflectionProbes([], render, ctx);
    const follow = probes.find((p) => p.kind === "follow_through");
    expect(follow?.question).not.toMatch(/\.\./); // no double period
  });

  it("names a controllable cause the student repeated at least twice", () => {
    const ctx = derivePriorContext([
      reflection({ at: "2026-01-01", category: "strategy" }),
      reflection({ at: "2026-02-01", category: "strategy" }),
      reflection({ at: "2026-03-01", category: "misconception" }),
    ]);
    expect(ctx.recurringCause).toBe("strategy");
  });

  it("does NOT surface a pattern from a single occurrence", () => {
    const ctx = derivePriorContext([
      reflection({ at: "2026-01-01", category: "strategy" }),
      reflection({ at: "2026-02-01", category: "misconception" }),
    ]);
    expect(ctx.recurringCause).toBeNull();
  });
});

describe("buildReflectionProbes — personalized", () => {
  it("opens with a follow-through probe carrying the student's own last action", () => {
    const prior = derivePriorContext([
      reflection({ at: "2026-02-01", action: "redo two practice problems out loud" }),
    ]);
    const { probes } = buildReflectionProbes(
      [wrong("Solve 3x + 5 = 20.", "linear equations")],
      render,
      prior,
    );
    expect(probes[0].kind).toBe("follow_through");
    expect(probes[0].question).toContain("redo two practice problems out loud");
  });

  it("adds no follow-through probe when there is no prior action", () => {
    const { probes } = buildReflectionProbes(
      [wrong("Solve 3x + 5 = 20.", "linear equations")],
      render,
      EMPTY_PRIOR_CONTEXT,
    );
    expect(probes.some((p) => p.kind === "follow_through")).toBe(false);
  });

  it("names the recurring pattern in the synthesis, in task-focused language", () => {
    const prior = derivePriorContext([
      reflection({ at: "2026-01-01", category: "strategy" }),
      reflection({ at: "2026-02-01", category: "strategy" }),
    ]);
    const { probes } = buildReflectionProbes(
      [wrong("Solve 3x + 5 = 20.", "linear equations")],
      render,
      prior,
    );
    const synthesis = probes.find((p) => p.kind === "synthesis");
    expect(synthesis?.question).toContain("how you set your work up");
    // Still never about the person.
    expect(synthesis?.question.toLowerCase()).not.toMatch(/\b(bad at|not a .* person)\b/);
  });
});
