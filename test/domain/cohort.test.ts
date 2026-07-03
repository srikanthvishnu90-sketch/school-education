import { describe, expect, it } from "vitest";

import {
  analyzeCohort,
  compareStaggered,
  type CohortAnalysisConfig,
  type CohortEfficacyResult,
  type StudentGapSeries,
} from "@/domain";

/**
 * Cohort efficacy analytics — the honesty is the point. A cohort improving is
 * not evidence the product works, so these tests pin that: no result ever
 * exceeds the grade its design supports, every confound (attrition, regression
 * to the mean, baseline) is surfaced, and thin N suppresses the estimate.
 */

const CONFIG: CohortAnalysisConfig = {
  minN: 3,
  reversionReliability: 0.5,
  extremeEntryThreshold: 0.15,
};

function series(
  studentId: string,
  gaps: number[],
  overrides: Partial<StudentGapSeries> = {},
): StudentGapSeries {
  return {
    studentId,
    gaps,
    cyclesCompleted: gaps.length - 1,
    completed: true,
    entryGranularity: 3,
    ...overrides,
  };
}

describe("analyzeCohort — never exceeds a single-arm design", () => {
  it("a single cohort is associational, never quasi-experimental or causal", () => {
    const result = analyzeCohort(
      "c-1",
      [
        series("s1", [0.4, 0.2]),
        series("s2", [0.3, 0.25]),
        series("s3", [0.5, 0.3]),
      ],
      CONFIG,
    );
    expect(result.grade).toBe("associational");
    // A single arm can NEVER earn the quasi-experimental grade.
    expect(result.grade).not.toBe("quasi_experimental");
    expect(result.caveats[0]).toContain("single-arm");
    expect(result.meanGapChange).not.toBeNull();
    expect(result.distribution?.n).toBe(3);
  });

  it("below min-N → insufficient_n with every point estimate suppressed", () => {
    const result = analyzeCohort(
      "c-1",
      [series("s1", [0.4, 0.2]), series("s2", [0.3, 0.1])],
      CONFIG,
    );
    expect(result.grade).toBe("insufficient_n");
    expect(result.meanGapChange).toBeNull();
    expect(result.medianGapChange).toBeNull();
    expect(result.distribution).toBeNull();
    expect(result.doseResponse).toBeNull();
    // Structural counts survive; the CHANGE estimates are suppressed.
    expect(result.attrition.startingN).toBe(2);
    expect(result.attrition.fullCohortMeanGapChange).toBeNull();
    expect(result.attrition.survivorshipBias).toBeNull();
  });
});

describe("attrition — survivorship bias surfaced, not hidden", () => {
  it("reports full-cohort AND completers-only, and exposes their gap", () => {
    // Completers improve a lot; dropouts (held at last value) barely move.
    const result = analyzeCohort(
      "c-1",
      [
        series("s1", [0.4, 0.1]), // completer, change -0.30
        series("s2", [0.4, 0.1]), // completer, change -0.30
        series("s3", [0.4, 0.38], { completed: false }), // dropout, -0.02
        series("s4", [0.4, 0.38], { completed: false }), // dropout, -0.02
      ],
      CONFIG,
    );
    const a = result.attrition;
    expect(a.startingN).toBe(4);
    expect(a.completersN).toBe(2);
    expect(a.completersMeanGapChange).toBeCloseTo(-0.3, 10);
    expect(a.fullCohortMeanGapChange).toBeCloseTo(-0.16, 10);
    // completers − full: completers-only OVERSTATES the improvement.
    expect(a.survivorshipBias).toBeCloseTo(-0.14, 10);
    expect(result.caveats.some((c) => c.includes("survivorship bias"))).toBe(true);
  });
});

describe("regression to the mean — compared to expected reversion, not zero", () => {
  // Cohort mean entry = 0.4; extreme = entry > 0.55; r = 0.5.
  // Expected change for an extreme entrant = (0.5 − 1)·(entry − 0.4).
  const base = [
    series("lo1", [0.2, 0.2]),
    series("lo2", [0.2, 0.2]),
  ];

  it("an extreme entrant that only mean-reverts shows ZERO excess", () => {
    // Two extreme entrants at 0.6 → expected final 0.5; set gaps to exactly that.
    const result = analyzeCohort(
      "c-1",
      [...base, series("hi1", [0.6, 0.5]), series("hi2", [0.6, 0.5])],
      CONFIG,
    );
    const rtm = result.regressionToMean;
    expect(rtm).not.toBeNull();
    expect(rtm?.extremeN).toBe(2);
    // Observed change (−0.1) LOOKS like improvement against zero...
    expect(rtm?.observedMeanGapChange).toBeCloseTo(-0.1, 10);
    // ...but equals the expected mean-reversion, so the excess is ~0.
    expect(rtm?.expectedReversionChange).toBeCloseTo(-0.1, 10);
    expect(rtm?.excessBeyondReversion).toBeCloseTo(0, 10);
  });

  it("credits only the improvement BEYOND expected reversion", () => {
    const result = analyzeCohort(
      "c-1",
      [...base, series("hi1", [0.6, 0.3]), series("hi2", [0.6, 0.3])],
      CONFIG,
    );
    const rtm = result.regressionToMean;
    expect(rtm?.observedMeanGapChange).toBeCloseTo(-0.3, 10);
    expect(rtm?.expectedReversionChange).toBeCloseTo(-0.1, 10);
    // −0.3 observed minus −0.1 expected = −0.2 real, beyond reversion.
    expect(rtm?.excessBeyondReversion).toBeCloseTo(-0.2, 10);
  });

  it("is null when no student entered extreme (nothing to correct)", () => {
    const result = analyzeCohort(
      "c-1",
      [series("s1", [0.2, 0.1]), series("s2", [0.2, 0.1]), series("s3", [0.25, 0.2])],
      CONFIG,
    );
    expect(result.regressionToMean).toBeNull();
  });
});

describe("baseline covariates + dose-response", () => {
  it("records entry gap and entry granularity so improvement is conditioned", () => {
    const result = analyzeCohort(
      "c-1",
      [
        series("s1", [0.4, 0.2], { entryGranularity: 2 }),
        series("s2", [0.2, 0.1], { entryGranularity: 4 }),
        series("s3", [0.3, 0.2], { entryGranularity: 3 }),
      ],
      CONFIG,
    );
    expect(result.baseline.n).toBe(3);
    expect(result.baseline.meanEntryGap).toBeCloseTo(0.3, 10);
    expect(result.baseline.meanEntryGranularity).toBeCloseTo(3, 10);
  });

  it("dose-response grades 'dose_response' with ≥2 distinct doses, else associational", () => {
    const varied = analyzeCohort(
      "c-1",
      [
        series("s1", [0.4, 0.35], { cyclesCompleted: 1 }),
        series("s2", [0.4, 0.2], { cyclesCompleted: 3 }),
        series("s3", [0.4, 0.1], { cyclesCompleted: 5 }),
      ],
      CONFIG,
    );
    expect(varied.doseResponse?.grade).toBe("dose_response");
    expect(varied.doseResponse?.buckets.map((b) => b.cyclesCompleted)).toEqual([
      1, 3, 5,
    ]);

    const flat = analyzeCohort(
      "c-1",
      [
        series("s1", [0.4, 0.35], { cyclesCompleted: 2 }),
        series("s2", [0.4, 0.2], { cyclesCompleted: 2 }),
        series("s3", [0.4, 0.1], { cyclesCompleted: 2 }),
      ],
      CONFIG,
    );
    expect(flat.doseResponse?.grade).toBe("associational");
  });
});

describe("compareStaggered — quasi-experimental only with a real not-yet-treated control", () => {
  function result(cohortId: string, mean: number): CohortEfficacyResult {
    // A minimal associational result carrying the mean the comparison needs.
    return {
      cohortId,
      grade: "associational",
      n: 5,
      meanGapChange: mean,
      medianGapChange: mean,
      distribution: null,
      doseResponse: null,
      attrition: {
        startingN: 5,
        completersN: 5,
        fullCohortMeanGapChange: mean,
        completersMeanGapChange: mean,
        survivorshipBias: 0,
      },
      regressionToMean: null,
      baseline: { n: 5, meanEntryGap: 0.4, medianEntryGap: 0.4, meanEntryGranularity: 3 },
      caveats: [],
    };
  }

  const evaluatedAt = new Date("2026-03-01T00:00:00.000Z");

  it("earns 'quasi_experimental' when the control has NOT yet started", () => {
    const comparison = compareStaggered({
      treated: result("treated", -0.3),
      treatedAssignment: { cohortId: "treated", startedAt: new Date("2026-01-01T00:00:00.000Z") },
      control: result("control", -0.1),
      controlAssignment: { cohortId: "control", startedAt: new Date("2026-06-01T00:00:00.000Z") },
      evaluatedAt,
    });
    expect(comparison.grade).toBe("quasi_experimental");
    expect(comparison.valid).toBe(true);
    expect(comparison.difference).toBeCloseTo(-0.2, 10);
  });

  it("REFUSES and downgrades to associational when the control has already started", () => {
    const comparison = compareStaggered({
      treated: result("treated", -0.3),
      treatedAssignment: { cohortId: "treated", startedAt: new Date("2026-01-01T00:00:00.000Z") },
      control: result("control", -0.1),
      // Control already treated at evaluation time → not a valid control.
      controlAssignment: { cohortId: "control", startedAt: new Date("2026-02-01T00:00:00.000Z") },
      evaluatedAt,
    });
    expect(comparison.grade).toBe("associational");
    expect(comparison.valid).toBe(false);
    expect(comparison.difference).toBeNull();
  });

  it("is insufficient_n if either arm is insufficient", () => {
    const thin: CohortEfficacyResult = { ...result("control", -0.1), grade: "insufficient_n", meanGapChange: null };
    const comparison = compareStaggered({
      treated: result("treated", -0.3),
      treatedAssignment: { cohortId: "treated", startedAt: new Date("2026-01-01T00:00:00.000Z") },
      control: thin,
      controlAssignment: { cohortId: "control", startedAt: new Date("2026-06-01T00:00:00.000Z") },
      evaluatedAt,
    });
    expect(comparison.grade).toBe("insufficient_n");
    expect(comparison.difference).toBeNull();
  });
});
