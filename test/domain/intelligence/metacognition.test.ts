import { describe, expect, it } from "vitest";

import {
  compareConfidenceToPerformance,
  createReflectionPerformance,
  deriveReflectionOutcome,
  metacognitiveTrend,
  performanceBand,
  readSelfConfidence,
  summarizeClassCalibration,
  type ReflectionOutcome,
} from "@/domain/intelligence/metacognition";
import { createReflectionSession } from "@/domain/intelligence/session";

const AT = new Date("2026-05-01T10:00:00.000Z");

function session(pairs: { category: "metacognitive" | "technical"; answer: string }[]) {
  const messages = pairs.flatMap((p, i) => [
    {
      id: `q${i}`,
      sessionId: "s1",
      sender: "ai" as const,
      text: `question ${i}`,
      category: p.category,
      createdAt: AT,
    },
    {
      id: `a${i}`,
      sessionId: "s1",
      sender: "student" as const,
      text: p.answer,
      createdAt: AT,
    },
  ]);
  return createReflectionSession({
    id: "s1",
    reflectionId: "lesson-1",
    studentId: "stu-1",
    status: "completed",
    messages,
    startedAt: AT,
  });
}

describe("readSelfConfidence", () => {
  it("averages metacognitive scale answers, ignoring other categories", () => {
    const s = session([
      { category: "metacognitive", answer: "Very confident" }, // 1
      { category: "technical", answer: "I factored it wrong" }, // ignored
      { category: "metacognitive", answer: "Somewhat" }, // 0.5
    ]);
    expect(readSelfConfidence(s)).toBeCloseTo(0.75, 10);
  });

  it("is case/space insensitive and covers the rating scale too", () => {
    expect(readSelfConfidence(session([{ category: "metacognitive", answer: "  MOSTLY " }]))).toBe(
      0.75,
    );
  });

  it("returns null when there is no recognized metacognitive answer", () => {
    expect(
      readSelfConfidence(session([{ category: "metacognitive", answer: "banana" }])),
    ).toBeNull();
    expect(
      readSelfConfidence(session([{ category: "technical", answer: "Very confident" }])),
    ).toBeNull();
  });
});

describe("performanceBand", () => {
  it("splits emerging / developing / secure", () => {
    expect(performanceBand(0.2)).toBe("emerging");
    expect(performanceBand(0.49)).toBe("emerging");
    expect(performanceBand(0.5)).toBe("developing");
    expect(performanceBand(0.79)).toBe("developing");
    expect(performanceBand(0.8)).toBe("secure");
    expect(performanceBand(1)).toBe("secure");
  });
});

describe("compareConfidenceToPerformance", () => {
  it("is aligned within the tolerance band", () => {
    expect(compareConfidenceToPerformance(0.6, 0.5)).toBe("aligned");
    expect(compareConfidenceToPerformance(0.5, 0.64)).toBe("aligned"); // gap 0.14 < eps
    expect(compareConfidenceToPerformance(0.5, 0.5)).toBe("aligned");
  });

  it("flags confidence running ahead of the result", () => {
    expect(compareConfidenceToPerformance(0.9, 0.4)).toBe("confidence_ahead_of_result");
  });

  it("flags a result running ahead of confidence", () => {
    expect(compareConfidenceToPerformance(0.3, 0.9)).toBe("result_ahead_of_confidence");
  });
});

describe("createReflectionPerformance", () => {
  it("rejects a score outside [0, 1]", () => {
    expect(() =>
      createReflectionPerformance({
        reflectionId: "l1",
        studentId: "s1",
        score: 1.2,
        recordedAt: AT,
      }),
    ).toThrow();
  });

  it("freezes a valid performance", () => {
    const p = createReflectionPerformance({
      reflectionId: "l1",
      studentId: "s1",
      score: 0.6,
      recordedAt: AT,
    });
    expect(Object.isFrozen(p)).toBe(true);
  });
});

describe("deriveReflectionOutcome", () => {
  it("carries a null alignment when there is no self-confidence", () => {
    const outcome = deriveReflectionOutcome(
      { reflectionId: "l1", studentId: "s1", score: 0.5, recordedAt: AT },
      null,
    );
    expect(outcome.alignment).toBeNull();
    expect(outcome.band).toBe("developing");
  });

  it("computes the alignment when self-confidence is present", () => {
    const outcome = deriveReflectionOutcome(
      { reflectionId: "l1", studentId: "s1", score: 0.4, recordedAt: AT },
      0.9,
    );
    expect(outcome.alignment).toBe("confidence_ahead_of_result");
  });
});

describe("metacognitiveTrend", () => {
  const outcome = (
    reflectionId: string,
    selfConfidence: number,
    score: number,
    day: number,
  ): ReflectionOutcome =>
    deriveReflectionOutcome(
      {
        reflectionId,
        studentId: "s1",
        score,
        recordedAt: new Date(`2026-05-0${day}T10:00:00.000Z`),
      },
      selfConfidence,
    );

  it("is insufficient with fewer than two comparable points", () => {
    expect(metacognitiveTrend([outcome("l1", 0.9, 0.4, 1)]).direction).toBe("insufficient");
  });

  it("converges when the gap shrinks from first to last", () => {
    const trend = metacognitiveTrend([
      outcome("l1", 0.9, 0.3, 1), // gap 0.6
      outcome("l2", 0.6, 0.55, 3), // gap 0.05
    ]);
    expect(trend.direction).toBe("converging");
    expect(trend.points).toHaveLength(2);
  });

  it("diverges when the gap grows", () => {
    const trend = metacognitiveTrend([
      outcome("l1", 0.55, 0.5, 1), // gap 0.05
      outcome("l2", 0.95, 0.3, 3), // gap 0.65
    ]);
    expect(trend.direction).toBe("diverging");
  });

  it("ignores outcomes with no self-confidence and orders by time", () => {
    const withNull = deriveReflectionOutcome(
      { reflectionId: "l0", studentId: "s1", score: 0.5, recordedAt: new Date("2026-05-02T10:00:00.000Z") },
      null,
    );
    const trend = metacognitiveTrend([
      outcome("l2", 0.6, 0.55, 3),
      withNull,
      outcome("l1", 0.9, 0.3, 1),
    ]);
    expect(trend.points.map((p) => p.reflectionId)).toEqual(["l1", "l2"]);
  });
});

describe("summarizeClassCalibration", () => {
  const graded = (
    id: string,
    score: number,
    selfConfidence: number | null,
  ): ReflectionOutcome =>
    deriveReflectionOutcome(
      { reflectionId: id, studentId: `s-${id}`, score, recordedAt: AT },
      selfConfidence,
    );

  it("folds per-student outcomes into aggregate counts by bucket", () => {
    const summary = summarizeClassCalibration([
      graded("l1", 0.5, 0.55), // aligned (gap 0.05)
      graded("l2", 0.3, 0.9), // confidence ahead of result
      graded("l3", 0.9, 0.4), // result ahead of confidence
      graded("l4", 0.8, 0.82), // aligned
    ]);
    expect(summary).toEqual({
      gradedCount: 4,
      comparableCount: 4,
      alignedCount: 2,
      confidenceAheadCount: 1,
      resultAheadCount: 1,
    });
  });

  it("counts a graded student with no self-confidence but never buckets them", () => {
    const summary = summarizeClassCalibration([
      graded("l1", 0.5, 0.55), // aligned
      graded("l2", 0.4, null), // graded, no confidence to compare
    ]);
    expect(summary.gradedCount).toBe(2);
    expect(summary.comparableCount).toBe(1);
    expect(summary.alignedCount).toBe(1);
    expect(summary.confidenceAheadCount).toBe(0);
    expect(summary.resultAheadCount).toBe(0);
  });

  it("is all zeros when no students are graded", () => {
    expect(summarizeClassCalibration([])).toEqual({
      gradedCount: 0,
      comparableCount: 0,
      alignedCount: 0,
      confidenceAheadCount: 0,
      resultAheadCount: 0,
    });
  });
});
