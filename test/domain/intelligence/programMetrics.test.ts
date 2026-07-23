import { describe, expect, it } from "vitest";

import {
  computeProgramMetrics,
  type ProgramMetricsInput,
} from "@/domain/intelligence/programMetrics";

/** Build an input with empty defaults, overriding only what a test exercises. */
function input(over: Partial<ProgramMetricsInput> = {}): ProgramMetricsInput {
  return {
    rosterSize: 0,
    sessions: [],
    gradedOutcomes: [],
    calibrationDeltas: [],
    ...over,
  };
}

describe("computeProgramMetrics", () => {
  it("an empty program: every rate is null with zero counts (no divide-by-zero)", () => {
    const m = computeProgramMetrics(input());
    expect(m.participationRate).toBeNull();
    expect(m.completionRate).toBeNull();
    expect(m.alignmentShare).toBeNull();
    expect(m.meanAbsCalibrationGap).toBeNull();
    expect(m.gradedCount).toBe(0);
    expect(m.startedCount).toBe(0);
    expect(m.completedCount).toBe(0);
    expect(m.rosterSize).toBe(0);
    expect(m.participantCount).toBe(0);
    expect(m.calibrationGapCount).toBe(0);
  });

  it("computes each rate exactly for a hand-built mix", () => {
    const m = computeProgramMetrics(
      input({
        rosterSize: 4,
        // 3 distinct students started (student-b twice); 2 completed of 4 started.
        sessions: [
          { studentId: "student-a", status: "completed" },
          { studentId: "student-b", status: "completed" },
          { studentId: "student-b", status: "active" },
          { studentId: "student-c", status: "abandoned" },
        ],
        // 4 graded, 2 aligned (one graded reflection has no self-confidence → null).
        gradedOutcomes: [
          { alignment: "aligned" },
          { alignment: "aligned" },
          { alignment: "confidence_ahead_of_result" },
          { alignment: null },
        ],
        // mean |delta| = (0.1 + 0.3 + 0.2) / 3 = 0.2
        calibrationDeltas: [0.1, -0.3, 0.2],
      }),
    );

    // participation: 3 distinct started / 4 roster = 0.75
    expect(m.participationRate).toBeCloseTo(0.75, 10);
    // completion: 2 completed / 4 started = 0.5
    expect(m.completionRate).toBeCloseTo(0.5, 10);
    // alignmentShare: 2 aligned / 4 graded = 0.5
    expect(m.alignmentShare).toBeCloseTo(0.5, 10);
    // meanAbsCalibrationGap: mean of |0.1|, |-0.3|, |0.2| = 0.2
    expect(m.meanAbsCalibrationGap).toBeCloseTo(0.2, 10);
    expect(m.gradedCount).toBe(4);
    expect(m.startedCount).toBe(4);
    expect(m.completedCount).toBe(2);
    expect(m.rosterSize).toBe(4);
    expect(m.participantCount).toBe(3);
    expect(m.calibrationGapCount).toBe(3);
  });

  it("participationRate clamps to 1 when the started set exceeds the roster", () => {
    // A roster of 1, but 2 distinct students have sessions (e.g. one lost standing
    // consent and dropped off the roster of record) → clamp to 1, never > 1.
    const m = computeProgramMetrics(
      input({
        rosterSize: 1,
        sessions: [
          { studentId: "student-a", status: "completed" },
          { studentId: "student-b", status: "active" },
        ],
      }),
    );
    expect(m.participationRate).toBe(1);
  });

  it("participationRate is null when the roster is empty (no divide-by-zero)", () => {
    const m = computeProgramMetrics(
      input({
        rosterSize: 0,
        sessions: [{ studentId: "student-a", status: "active" }],
      }),
    );
    expect(m.participationRate).toBeNull();
    expect(m.startedCount).toBe(1);
  });

  it("completionRate is null with no started sessions but a non-empty roster", () => {
    const m = computeProgramMetrics(input({ rosterSize: 3 }));
    expect(m.participationRate).toBe(0); // 0 started / 3 roster
    expect(m.completionRate).toBeNull();
  });

  it("alignmentShare counts a graded-but-uncomparable reflection as not aligned", () => {
    const m = computeProgramMetrics(
      input({
        gradedOutcomes: [{ alignment: "aligned" }, { alignment: null }],
      }),
    );
    expect(m.alignmentShare).toBeCloseTo(0.5, 10);
    expect(m.gradedCount).toBe(2);
  });

  it("meanAbsCalibrationGap takes magnitudes, so signs never cancel", () => {
    // Signed deltas +0.4 and -0.4 must NOT average to 0; |.| gives 0.4.
    const m = computeProgramMetrics(input({ calibrationDeltas: [0.4, -0.4] }));
    expect(m.meanAbsCalibrationGap).toBeCloseTo(0.4, 10);
  });

  it("a fully participating, fully aligned program reads 1 / 1 / 1", () => {
    const m = computeProgramMetrics(
      input({
        rosterSize: 2,
        sessions: [
          { studentId: "student-a", status: "completed" },
          { studentId: "student-b", status: "completed" },
        ],
        gradedOutcomes: [{ alignment: "aligned" }, { alignment: "aligned" }],
        calibrationDeltas: [0, 0],
      }),
    );
    expect(m.participationRate).toBe(1);
    expect(m.completionRate).toBe(1);
    expect(m.alignmentShare).toBe(1);
    expect(m.meanAbsCalibrationGap).toBe(0);
  });
});
