import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain";
import type { SkillCalibration } from "@/domain";
import {
  DEFAULT_VERIFICATION_CONFIG,
  calibrationTrajectoryVerdict,
  createActionVerification,
  isStale,
  toSkillMeasure,
  verifyAction,
  type ActionVerification,
  type SkillMeasure,
} from "@/domain";

/**
 * The verification cycle is the honest close of the loop, so its math is held to
 * the same bar as the calibration engine: pure, deterministic, and NEVER a false
 * verdict when the evidence is thin. Accuracy (got better) and calibration (knows
 * better) are judged SEPARATELY — these tests pin that they never leak into each
 * other.
 */

function measure(overrides: Partial<SkillMeasure> = {}): SkillMeasure {
  return {
    skillId: "skill-linear",
    accuracy: 0.5,
    brier: 0.25,
    itemCount: 4,
    ...overrides,
  };
}

describe("verifyAction — accuracy and calibration are independent", () => {
  it("accuracy UP but calibration FLAT → improved / flat", () => {
    const baseline = measure({ accuracy: 0.4, brier: 0.3 });
    const followup = measure({ accuracy: 0.7, brier: 0.3 });
    const result = verifyAction(baseline, followup);
    expect(result.accuracyVerdict).toBe("improved");
    expect(result.calibrationVerdict).toBe("flat");
  });

  it("calibration UP (brier down) but accuracy FLAT → flat / improved", () => {
    const baseline = measure({ accuracy: 0.6, brier: 0.3 });
    const followup = measure({ accuracy: 0.6, brier: 0.1 });
    const result = verifyAction(baseline, followup);
    expect(result.accuracyVerdict).toBe("flat");
    expect(result.calibrationVerdict).toBe("improved");
  });

  it("both regress → regressed / regressed", () => {
    const baseline = measure({ accuracy: 0.8, brier: 0.1 });
    const followup = measure({ accuracy: 0.3, brier: 0.4 });
    const result = verifyAction(baseline, followup);
    expect(result.accuracyVerdict).toBe("regressed");
    expect(result.calibrationVerdict).toBe("regressed");
  });

  it("moves within tau on both axes → flat / flat", () => {
    const baseline = measure({ accuracy: 0.5, brier: 0.25 });
    const followup = measure({ accuracy: 0.52, brier: 0.26 });
    const result = verifyAction(baseline, followup);
    expect(result.accuracyVerdict).toBe("flat");
    expect(result.calibrationVerdict).toBe("flat");
  });
});

describe("verifyAction — never a false verdict on thin evidence", () => {
  it("baseline below the item floor → both inconclusive", () => {
    const result = verifyAction(
      measure({ itemCount: 2, accuracy: 0.2 }),
      measure({ itemCount: 5, accuracy: 0.9 }),
    );
    expect(result.accuracyVerdict).toBe("inconclusive");
    expect(result.calibrationVerdict).toBe("inconclusive");
  });

  it("follow-up below the item floor → both inconclusive", () => {
    const result = verifyAction(
      measure({ itemCount: 5 }),
      measure({ itemCount: DEFAULT_VERIFICATION_CONFIG.minItems - 1 }),
    );
    expect(result.accuracyVerdict).toBe("inconclusive");
    expect(result.calibrationVerdict).toBe("inconclusive");
  });

  it("no brier on the follow-up → accuracy still judged, calibration inconclusive", () => {
    const result = verifyAction(
      measure({ accuracy: 0.4, brier: 0.3 }),
      measure({ accuracy: 0.8, brier: undefined }),
    );
    expect(result.accuracyVerdict).toBe("improved");
    expect(result.calibrationVerdict).toBe("inconclusive");
  });

  it("comparing two different skills is a programming error, not a verdict", () => {
    expect(() =>
      verifyAction(measure({ skillId: "skill-a" }), measure({ skillId: "skill-b" })),
    ).toThrow(DomainError);
  });

  it("respects a configurable tau", () => {
    const baseline = measure({ accuracy: 0.5, brier: 0.25 });
    const followup = measure({ accuracy: 0.58, brier: 0.25 });
    // Δaccuracy 0.08 is "improved" at the default tau but "flat" at a wider one.
    expect(verifyAction(baseline, followup).accuracyVerdict).toBe("improved");
    expect(
      verifyAction(baseline, followup, {
        ...DEFAULT_VERIFICATION_CONFIG,
        tauAccuracy: 0.1,
      }).accuracyVerdict,
    ).toBe("flat");
  });
});

describe("calibrationTrajectoryVerdict — reuses P3 trajectory with a min-n gate", () => {
  it("fewer than two real brier points → insufficient (never a claim from one dot)", () => {
    expect(calibrationTrajectoryVerdict([])).toBe("insufficient");
    expect(calibrationTrajectoryVerdict([measure({ brier: 0.2 })])).toBe(
      "insufficient",
    );
    // A lone real point among unmeasurable ones is still insufficient.
    expect(
      calibrationTrajectoryVerdict([
        measure({ brier: undefined }),
        measure({ brier: 0.2 }),
      ]),
    ).toBe("insufficient");
  });

  it("brier falling over time → improving; rising → worsening", () => {
    expect(
      calibrationTrajectoryVerdict([
        measure({ brier: 0.4 }),
        measure({ brier: 0.25 }),
        measure({ brier: 0.1 }),
      ]),
    ).toBe("improving");
    expect(
      calibrationTrajectoryVerdict([
        measure({ brier: 0.1 }),
        measure({ brier: 0.35 }),
      ]),
    ).toBe("worsening");
  });
});

describe("toSkillMeasure — an unmeasured skill is null, not a zero", () => {
  function skillCalibration(
    overrides: Partial<SkillCalibration> = {},
  ): SkillCalibration {
    return {
      skillId: "skill-linear",
      n: 4,
      brier: 0.2,
      meanConfidence: 0.7,
      accuracy: 0.5,
      bias: 0.2,
      discrimination: 0.1,
      ...overrides,
    };
  }

  it("maps a measured skill to accuracy + brier + itemCount", () => {
    expect(toSkillMeasure(skillCalibration())).toEqual({
      skillId: "skill-linear",
      accuracy: 0.5,
      brier: 0.2,
      itemCount: 4,
    });
  });

  it("is null when there are no matched items", () => {
    expect(
      toSkillMeasure(skillCalibration({ n: 0, accuracy: null, brier: null })),
    ).toBeNull();
  });

  it("carries brier through as undefined when it is unmeasurable", () => {
    expect(toSkillMeasure(skillCalibration({ brier: null }))?.brier).toBeUndefined();
  });
});

describe("isStale + createActionVerification", () => {
  const opened = new Date("2026-01-01T00:00:00.000Z");
  const base: ActionVerification = {
    id: "verif-1",
    nextActionId: "ref-1",
    studentId: "stu-1",
    targetSkillId: "skill-linear",
    openedAt: opened,
    baseline: measure(),
    baselineAssessmentId: "assess-1",
    accuracyVerdict: "pending",
    calibrationVerdict: "pending",
  };

  it("is stale only after the horizon elapses", () => {
    const horizon = DEFAULT_VERIFICATION_CONFIG.stalenessHorizonMs;
    expect(isStale(base, new Date(opened.getTime() + horizon))).toBe(false);
    expect(isStale(base, new Date(opened.getTime() + horizon + 1))).toBe(true);
  });

  it("rejects a baseline that measures a different skill than the action targets", () => {
    expect(() =>
      createActionVerification({
        ...base,
        baseline: measure({ skillId: "skill-other" }),
      }),
    ).toThrow(DomainError);
  });

  it("rejects a follow-up that measures a different skill than the action targets", () => {
    expect(() =>
      createActionVerification({
        ...base,
        followup: measure({ skillId: "skill-other" }),
      }),
    ).toThrow(DomainError);
  });

  it("freezes a valid verification", () => {
    expect(Object.isFrozen(createActionVerification(base))).toBe(true);
  });
});
