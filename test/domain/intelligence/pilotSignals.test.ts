import { describe, expect, it } from "vitest";

import {
  computePilotSignals,
  type PilotSignalsInput,
} from "@/domain/intelligence/pilotSignals";
import type { ProbeSelfScore } from "@/domain/intelligence/probeAttempt";

/** Build an input with empty defaults, overriding only what a test exercises. */
function input(over: Partial<PilotSignalsInput> = {}): PilotSignalsInput {
  return {
    completedReflectionsByStudent: [],
    probeSelfScores: [],
    ...over,
  };
}

describe("computePilotSignals", () => {
  it("an empty pilot: zero counts, every rate null (no divide-by-zero)", () => {
    const s = computePilotSignals(input());
    expect(s.activeStudents).toBe(0);
    expect(s.returnedForSecond).toBe(0);
    expect(s.returnRateSecond).toBeNull();
    expect(s.returnedForThird).toBe(0);
    expect(s.returnRateThird).toBeNull();
    expect(s.probeCompletionCount).toBe(0);
    expect(s.probeCompletionRate).toBeNull();
    expect(s.studentsWithMultipleProbes).toBe(0);
    expect(s.improvingCount).toBe(0);
    expect(s.improvingShare).toBeNull();
  });

  it("computes each return + probe rate exactly for a hand-built cohort", () => {
    // 5 students. Completed counts: 3, 2, 1, 0, 4.
    //  - active (≥1): 4 students (the 0 is not active).
    //  - returned #2 (≥2): 3 students → 3/4 = 0.75.
    //  - returned #3 (≥3): 2 students → 2/4 = 0.5.
    const s = computePilotSignals(
      input({
        completedReflectionsByStudent: [3, 2, 1, 0, 4],
        // Probe series per student (time-ordered):
        //  - improving:  not_yet → got_it
        //  - steady:     partly → partly
        //  - mixed:      got_it → not_yet
        //  - one probe:  got_it (not enough for movement)
        //  - none:       []
        probeSelfScores: [
          ["not_yet", "got_it"],
          ["partly", "partly"],
          ["got_it", "not_yet"],
          ["got_it"],
          [],
        ],
      }),
    );

    expect(s.activeStudents).toBe(4);
    expect(s.returnedForSecond).toBe(3);
    expect(s.returnRateSecond).toBeCloseTo(0.75, 10);
    expect(s.returnedForThird).toBe(2);
    expect(s.returnRateThird).toBeCloseTo(0.5, 10);

    // 4 students did ≥1 probe (the empty one did not) → 4/4 active = 1.
    expect(s.probeCompletionCount).toBe(4);
    expect(s.probeCompletionRate).toBeCloseTo(1, 10);

    // 3 students have ≥2 probes; of those exactly one series is "improving".
    expect(s.studentsWithMultipleProbes).toBe(3);
    expect(s.improvingCount).toBe(1);
    expect(s.improvingShare).toBeCloseTo(1 / 3, 10);
  });

  it("return rates are null when nobody is active, even with started work", () => {
    // Everyone started but nobody completed a reflection → no active cohort.
    const s = computePilotSignals(
      input({ completedReflectionsByStudent: [0, 0, 0] }),
    );
    expect(s.activeStudents).toBe(0);
    expect(s.returnRateSecond).toBeNull();
    expect(s.returnRateThird).toBeNull();
    expect(s.probeCompletionRate).toBeNull();
  });

  it("improvingShare is null when no student has two or more probes", () => {
    const s = computePilotSignals(
      input({
        completedReflectionsByStudent: [1, 1],
        // Each student has at most one probe → no series can move.
        probeSelfScores: [["got_it"], []],
      }),
    );
    expect(s.probeCompletionCount).toBe(1);
    expect(s.studentsWithMultipleProbes).toBe(0);
    expect(s.improvingCount).toBe(0);
    expect(s.improvingShare).toBeNull();
  });

  it("improvingShare counts only strictly-improving series (steady/mixed excluded)", () => {
    // Three students, all with ≥2 probes: one improving, one steady, one mixed.
    const series: ProbeSelfScore[][] = [
      ["not_yet", "partly", "got_it"], // improving (monotonic rise)
      ["partly", "partly"], // steady
      ["got_it", "partly"], // mixed (dipped)
    ];
    const s = computePilotSignals(
      input({
        completedReflectionsByStudent: [2, 2, 2],
        probeSelfScores: series,
      }),
    );
    expect(s.studentsWithMultipleProbes).toBe(3);
    expect(s.improvingCount).toBe(1);
    expect(s.improvingShare).toBeCloseTo(1 / 3, 10);
  });

  it("a fully-returning, fully-improving cohort reads 1 / 1 / 1", () => {
    const s = computePilotSignals(
      input({
        completedReflectionsByStudent: [3, 3],
        probeSelfScores: [
          ["not_yet", "got_it"],
          ["partly", "got_it"],
        ],
      }),
    );
    expect(s.returnRateSecond).toBe(1);
    expect(s.returnRateThird).toBe(1);
    expect(s.probeCompletionRate).toBe(1);
    expect(s.improvingShare).toBe(1);
  });
});
