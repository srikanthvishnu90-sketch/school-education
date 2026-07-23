import { describe, expect, it } from "vitest";

import {
  createProbeAttempt,
  demonstratedFromSelfScore,
  type ProbeAttempt,
  type ProbeSelfScore,
} from "@/domain/intelligence/probeAttempt";

const NOW = new Date("2026-07-20T12:00:00.000Z");

const base: ProbeAttempt = {
  id: "probe-1",
  reflectionId: "lesson-demo",
  studentId: "student-avery",
  skillId: "skill-1",
  response: "I factored x^2 + 5x + 6 as (x + 2)(x + 3) by finding 2 and 3.",
  selfScore: "got_it",
  attemptedAt: NOW,
};

describe("createProbeAttempt — invariants", () => {
  it("builds a frozen attempt from valid input", () => {
    const a = createProbeAttempt(base);
    expect(a).toEqual(base);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("allows a missing skillId (the probe need not be skill-tagged)", () => {
    const a = createProbeAttempt({
      id: base.id,
      reflectionId: base.reflectionId,
      studentId: base.studentId,
      response: base.response,
      selfScore: base.selfScore,
      attemptedAt: base.attemptedAt,
    });
    expect(a.skillId).toBeUndefined();
  });

  it("rejects an empty response (a from-memory attempt must have content)", () => {
    expect(() => createProbeAttempt({ ...base, response: "" })).toThrow();
  });

  it("rejects a response longer than the bound", () => {
    expect(() =>
      createProbeAttempt({ ...base, response: "x".repeat(4001) }),
    ).toThrow();
  });

  it("rejects an invalid selfScore", () => {
    expect(() =>
      createProbeAttempt({
        ...base,
        selfScore: "aced_it" as unknown as ProbeSelfScore,
      }),
    ).toThrow();
  });
});

describe("demonstratedFromSelfScore — the calibration bridge", () => {
  it("maps got_it → 1, partly → 0.5, not_yet → 0", () => {
    expect(demonstratedFromSelfScore("got_it")).toBe(1);
    expect(demonstratedFromSelfScore("partly")).toBe(0.5);
    expect(demonstratedFromSelfScore("not_yet")).toBe(0);
  });

  it("returns a value in the unit interval for every self-score", () => {
    const scores: ProbeSelfScore[] = ["got_it", "partly", "not_yet"];
    for (const s of scores) {
      const d = demonstratedFromSelfScore(s);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});
