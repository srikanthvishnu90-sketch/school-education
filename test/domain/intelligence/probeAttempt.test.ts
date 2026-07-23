import { describe, expect, it } from "vitest";

import {
  createProbeAttempt,
  demonstratedFromSelfScore,
  summariseProbeMovement,
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

/** A probe with just the fields the movement summary reads (order via attemptedAt). */
function attempt(selfScore: ProbeSelfScore, day: number): ProbeAttempt {
  return {
    id: `probe-${day}`,
    reflectionId: "lesson-demo",
    studentId: "student-avery",
    response: "From memory, I worked it through.",
    selfScore,
    attemptedAt: new Date(`2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`),
  };
}

describe("summariseProbeMovement — the private movement read", () => {
  it("counts each self-score across all attempts", () => {
    const m = summariseProbeMovement([
      attempt("got_it", 10),
      attempt("partly", 11),
      attempt("not_yet", 12),
      attempt("got_it", 13),
    ]);
    expect(m).toMatchObject({ got: 2, partly: 1, notYet: 1 });
  });

  it("reads the latest self-score by attempt time, not input order", () => {
    // Newest by time is day 14 (partly), even though it is listed first.
    const m = summariseProbeMovement([
      attempt("partly", 14),
      attempt("not_yet", 10),
      attempt("got_it", 12),
    ]);
    expect(m.latestSelfScore).toBe("partly");
  });

  it("insufficient with fewer than two attempts", () => {
    expect(summariseProbeMovement([]).direction).toBe("insufficient");
    expect(summariseProbeMovement([]).latestSelfScore).toBeNull();
    expect(summariseProbeMovement([attempt("got_it", 10)]).direction).toBe(
      "insufficient",
    );
  });

  it("improving when the series rises without dipping", () => {
    const m = summariseProbeMovement([
      attempt("not_yet", 10),
      attempt("partly", 11),
      attempt("got_it", 12),
    ]);
    expect(m.direction).toBe("improving");
    expect(m.latestSelfScore).toBe("got_it");
  });

  it("steady when the series holds flat", () => {
    const m = summariseProbeMovement([
      attempt("partly", 10),
      attempt("partly", 11),
      attempt("partly", 12),
    ]);
    expect(m.direction).toBe("steady");
  });

  it("mixed when the series falls", () => {
    const m = summariseProbeMovement([
      attempt("got_it", 10),
      attempt("not_yet", 11),
    ]);
    expect(m.direction).toBe("mixed");
  });

  it("mixed when the series wobbles (non-monotonic)", () => {
    const m = summariseProbeMovement([
      attempt("partly", 10),
      attempt("got_it", 11),
      attempt("not_yet", 12),
    ]);
    expect(m.direction).toBe("mixed");
  });

  it("orders by attempt time regardless of input order", () => {
    const m = summariseProbeMovement([
      attempt("got_it", 12),
      attempt("not_yet", 10),
      attempt("partly", 11),
    ]);
    // Time order not_yet(0) → partly(.5) → got_it(1) rises without dipping.
    expect(m.direction).toBe("improving");
  });
});
