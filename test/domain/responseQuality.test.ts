import { describe, expect, it } from "vitest";

import {
  assessResponseQuality,
  detectImplausibleLatency,
  detectNoCoverage,
  detectStraightlining,
  detectZeroVarianceAffect,
  excludeQuarantined,
  isEligibleSession,
  type ResponseQuality,
} from "@/domain";

/**
 * The honesty architecture's data-quality gate: deterministic detectors that
 * QUARANTINE low-quality sessions, and a single exclusion point that keeps them
 * out of aggregates. Never a verdict about a student; only data quality.
 */

const AT = new Date("2026-07-01T00:00:00Z");

describe("detectors", () => {
  it("straight-lining: near-zero variance across enough item confidences", () => {
    expect(detectStraightlining([0.9, 0.9, 0.9, 0.9])).toBe(true);
    expect(detectStraightlining([0.9, 0.2, 0.7, 0.5])).toBe(false);
    // Too few items to judge.
    expect(detectStraightlining([0.9, 0.9])).toBe(false);
  });

  it("implausible latency: any screen under the human floor", () => {
    expect(detectImplausibleLatency([4000, 200, 3000])).toBe(true);
    expect(detectImplausibleLatency([4000, 2500, 3000])).toBe(false);
    expect(detectImplausibleLatency([])).toBe(false);
  });

  it("no coverage: reflection references none of the actual items/skills", () => {
    expect(
      detectNoCoverage("I just tried harder next time", ["interpreting slope", "linear equations"]),
    ).toBe(true);
    expect(
      detectNoCoverage("I flipped the slope fraction", ["interpreting slope"]),
    ).toBe(false);
    // Cannot judge without refs or text.
    expect(detectNoCoverage("", ["slope"])).toBe(false);
    expect(detectNoCoverage("anything", [])).toBe(false);
  });

  it("zero-variance affect: the same selection across enough sessions", () => {
    expect(
      detectZeroVarianceAffect([["anxious"], ["anxious"], ["anxious"]]),
    ).toBe(true);
    expect(
      detectZeroVarianceAffect([["anxious"], ["proud"], ["anxious"]]),
    ).toBe(false);
    // All-skips (empty) is honest silence, not a fabrication signal.
    expect(detectZeroVarianceAffect([[], [], []])).toBe(false);
  });
});

describe("assessResponseQuality", () => {
  it("quarantines a straight-lined session and lists the signal", () => {
    const q = assessResponseQuality({
      sessionId: "sess-1",
      studentId: "stu-1",
      at: AT,
      confidences: [0.9, 0.9, 0.9, 0.9],
      screenLatenciesMs: [3000, 4000, 3500, 3000, 2000],
    });
    expect(q.signals).toContain("straightlining");
    expect(q.quarantined).toBe(true);
    expect(isEligibleSession(q)).toBe(false);
  });

  it("passes a good-faith session with no signals", () => {
    const q = assessResponseQuality({
      sessionId: "sess-2",
      studentId: "stu-1",
      at: AT,
      confidences: [0.8, 0.3, 0.6, 0.5],
      screenLatenciesMs: [4000, 3000, 5000, 3500, 4000],
      reflectionText: "I flipped my slope fraction the wrong way",
      coverageRefs: ["interpreting slope"],
    });
    expect(q.signals).toEqual([]);
    expect(q.quarantined).toBe(false);
    expect(isEligibleSession(q)).toBe(true);
  });
});

describe("excludeQuarantined — the single exclusion point for aggregates", () => {
  const qualities: ResponseQuality[] = [
    { sessionId: "sess-bad", studentId: "stu-1", signals: ["straightlining"], quarantined: true, at: AT },
    { sessionId: "sess-good", studentId: "stu-1", signals: [], quarantined: false, at: AT },
  ];

  it("drops calibration contributions from quarantined sessions", () => {
    const contributions = [
      { sessionId: "sess-bad", bias: 0.4 },
      { sessionId: "sess-good", bias: 0.1 },
    ];
    const kept = excludeQuarantined(contributions, qualities, (c) => c.sessionId);
    expect(kept.map((c) => c.sessionId)).toEqual(["sess-good"]);
  });

  it("drops cohort samples from quarantined sessions alike", () => {
    const samples = [
      { sessionId: "sess-good", gapChange: -0.2 },
      { sessionId: "sess-bad", gapChange: 0.9 },
    ];
    const kept = excludeQuarantined(samples, qualities, (s) => s.sessionId);
    expect(kept).toHaveLength(1);
    expect(kept[0].sessionId).toBe("sess-good");
  });
});
