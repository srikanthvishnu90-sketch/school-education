import { describe, expect, it } from "vitest";

import {
  affectValence,
  classifyCongruence,
  computeCongruence,
  congruenceGap,
  expectedValence,
  performanceRelToGoal,
} from "@/domain/gap/congruence";
import { makeAffectSnapshot, makeGoal, makeOutcome } from "../fixtures/domain";

describe("affectValence", () => {
  it("is the mean valence of the named states", () => {
    // single label at -0.3
    expect(affectValence(makeAffectSnapshot())).toBeCloseTo(-0.3, 10);
    const two = makeAffectSnapshot({
      labels: [
        { term: "proud", valence: 0.8, arousal: 0.5 },
        { term: "calm", valence: 0.2, arousal: 0.2 },
      ],
    });
    expect(affectValence(two)).toBeCloseTo(0.5, 10);
  });
});

describe("performanceRelToGoal", () => {
  it("is achievedFraction − targetScore", () => {
    // makeOutcome: 1 of 2 correct ⇒ 0.5; goal target 0.8 ⇒ -0.3
    expect(performanceRelToGoal(makeOutcome(), makeGoal())).toBeCloseTo(
      -0.3,
      10,
    );
  });
  it("is exactly 0 when achieved equals the target", () => {
    expect(
      performanceRelToGoal(makeOutcome(), makeGoal({ targetScore: 0.5 })),
    ).toBeCloseTo(0, 10);
  });
  it("returns null when no items were scored", () => {
    expect(
      performanceRelToGoal(makeOutcome({ itemOutcomes: [] }), makeGoal()),
    ).toBeNull();
  });
});

describe("expectedValence — monotonic, sign-symmetric", () => {
  it("is identity on [-1, 1]", () => {
    expect(expectedValence(0)).toBe(0);
    expect(expectedValence(0.4)).toBeCloseTo(0.4, 10);
    expect(expectedValence(-0.4)).toBeCloseTo(-0.4, 10);
  });
  it("is odd: expectedValence(-x) = -expectedValence(x)", () => {
    for (const x of [0, 0.1, 0.5, 0.9, 1]) {
      expect(expectedValence(-x)).toBeCloseTo(-expectedValence(x), 12);
    }
  });
  it("clamps beyond the range", () => {
    expect(expectedValence(1.5)).toBe(1);
    expect(expectedValence(-1.5)).toBe(-1);
  });
});

describe("congruenceGap + classifyCongruence", () => {
  it("gap = affectValence − expectedValence(relToGoal)", () => {
    // affect -0.3, relToGoal -0.3 ⇒ expected -0.3 ⇒ gap 0
    expect(
      congruenceGap(makeAffectSnapshot(), makeOutcome(), makeGoal()),
    ).toBeCloseTo(0, 10);
  });

  it("classifies over_positive / over_negative / congruent by delta", () => {
    expect(classifyCongruence(0.7)).toBe("over_positive");
    expect(classifyCongruence(-0.7)).toBe("over_negative");
    expect(classifyCongruence(0.5)).toBe("congruent");
  });
  it("is inclusive at the boundary (|gap| = delta ⇒ congruent)", () => {
    expect(classifyCongruence(0.6, 0.6)).toBe("congruent");
    expect(classifyCongruence(-0.6, 0.6)).toBe("congruent");
  });
});

describe("computeCongruence — the detector", () => {
  it("returns null with no goal (never guess the student's target)", () => {
    expect(
      computeCongruence(makeAffectSnapshot(), makeOutcome(), null),
    ).toBeNull();
  });
  it("returns null when performance is unmeasurable", () => {
    expect(
      computeCongruence(
        makeAffectSnapshot(),
        makeOutcome({ itemOutcomes: [] }),
        makeGoal(),
      ),
    ).toBeNull();
  });
  it("returns a signed gap + direction otherwise", () => {
    const result = computeCongruence(
      makeAffectSnapshot({
        labels: [{ term: "proud", valence: 0.7, arousal: 0.5 }],
      }),
      makeOutcome(), // accuracy 0.5
      makeGoal({ targetScore: 0.9 }), // relToGoal -0.4 ⇒ expected -0.4
    );
    // gap = 0.7 − (−0.4) = 1.1 ⇒ over_positive
    expect(result).not.toBeNull();
    expect(result!.gap).toBeCloseTo(1.1, 10);
    expect(result!.classification).toBe("over_positive");
  });
});
