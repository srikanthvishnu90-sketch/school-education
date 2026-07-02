import { describe, expect, it } from "vitest";

import type { AssessmentItem } from "@/domain/skill";
import {
  accuracy,
  bias,
  brier,
  classifyCalibration,
  computeCalibration,
  discrimination,
  globalGap,
  meanConfidence,
  perSkill,
  trajectory,
} from "@/domain/gap/calibration";
import { makeOutcome, makePrediction } from "../fixtures/domain";

// Fixtures: item-1 confidence 0.9 → correct; item-2 confidence 0.4 → incorrect.
// pairs = (0.9, 1), (0.4, 0)
describe("computeCalibration — worked values", () => {
  const summary = computeCalibration(makePrediction(), makeOutcome());

  it("computes brier = 0.085", () => {
    expect(summary.brier).toBeCloseTo(0.085, 10);
    expect(brier(makePrediction(), makeOutcome())).toBeCloseTo(0.085, 10);
  });
  it("computes meanConfidence = 0.65, accuracy = 0.5", () => {
    expect(summary.meanConfidence).toBeCloseTo(0.65, 10);
    expect(summary.accuracy).toBeCloseTo(0.5, 10);
    expect(meanConfidence(makePrediction(), makeOutcome())).toBeCloseTo(
      0.65,
      10,
    );
    expect(accuracy(makePrediction(), makeOutcome())).toBeCloseTo(0.5, 10);
  });
  it("computes bias = 0.15 (overconfident)", () => {
    expect(summary.bias).toBeCloseTo(0.15, 10);
    expect(bias(makePrediction(), makeOutcome())).toBeCloseTo(0.15, 10);
  });
  it("computes discrimination = 0.5", () => {
    expect(summary.discrimination).toBeCloseTo(0.5, 10);
    expect(discrimination(makePrediction(), makeOutcome())).toBeCloseTo(
      0.5,
      10,
    );
  });
  it("computes globalGap = 0.2 (predicted 0.7 vs accuracy 0.5)", () => {
    expect(summary.globalGap).toBeCloseTo(0.2, 10);
    expect(globalGap(makePrediction(), makeOutcome())).toBeCloseTo(0.2, 10);
  });
  it("reports n = 2", () => {
    expect(summary.n).toBe(2);
  });
});

describe("edge cases return nulls, never throw", () => {
  it("n = 0 (no matched items) ⇒ all metrics null", () => {
    const unmatched = makePrediction({
      itemPredictions: [{ itemId: "no-such-item", confidence: 0.5 }],
    });
    const s = computeCalibration(unmatched, makeOutcome());
    expect(s.n).toBe(0);
    expect(s.brier).toBeNull();
    expect(s.meanConfidence).toBeNull();
    expect(s.accuracy).toBeNull();
    expect(s.bias).toBeNull();
    expect(s.discrimination).toBeNull();
    expect(s.globalGap).toBeNull();
  });

  it("all-correct ⇒ discrimination null (nothing to discriminate)", () => {
    const out = makeOutcome({
      itemOutcomes: [
        { itemId: "item-1", correct: true, pointsAwarded: 1 },
        { itemId: "item-2", correct: true, pointsAwarded: 1 },
      ],
    });
    const s = computeCalibration(makePrediction(), out);
    expect(s.accuracy).toBe(1);
    expect(s.discrimination).toBeNull();
  });

  it("all-incorrect ⇒ discrimination null", () => {
    const out = makeOutcome({
      itemOutcomes: [
        { itemId: "item-1", correct: false, pointsAwarded: 0 },
        { itemId: "item-2", correct: false, pointsAwarded: 0 },
      ],
    });
    const s = computeCalibration(makePrediction(), out);
    expect(s.accuracy).toBe(0);
    expect(s.discrimination).toBeNull();
  });
});

describe("classifyCalibration", () => {
  it("names direction within tolerance eps", () => {
    expect(classifyCalibration(0.2)).toBe("overconfident");
    expect(classifyCalibration(-0.2)).toBe("underconfident");
    expect(classifyCalibration(0.05)).toBe("calibrated");
  });
  it("is inclusive at the boundary (|bias| = eps ⇒ calibrated)", () => {
    expect(classifyCalibration(0.1, 0.1)).toBe("calibrated");
    expect(classifyCalibration(-0.1, 0.1)).toBe("calibrated");
  });
});

describe("perSkill", () => {
  const items: AssessmentItem[] = [
    {
      id: "item-1",
      assessmentId: "assess-1",
      skillId: "skill-A",
      prompt: "?",
      maxPoints: 1,
    },
    {
      id: "item-2",
      assessmentId: "assess-1",
      skillId: "skill-B",
      prompt: "?",
      maxPoints: 1,
    },
  ];

  it("splits metrics per skill, ordered by first appearance", () => {
    const result = perSkill(makePrediction(), makeOutcome(), items);
    expect(result.map((r) => r.skillId)).toEqual(["skill-A", "skill-B"]);
    expect(result[0].n).toBe(1);
    expect(result[0].accuracy).toBe(1); // item-1 correct
    expect(result[1].accuracy).toBe(0); // item-2 incorrect
    // single item per skill ⇒ no discrimination
    expect(result[0].discrimination).toBeNull();
  });

  it("omits skills with no matched items", () => {
    const result = perSkill(
      makePrediction({
        itemPredictions: [{ itemId: "item-1", confidence: 0.9 }],
      }),
      makeOutcome(),
      items,
    );
    expect(result.map((r) => r.skillId)).toEqual(["skill-A"]);
  });
});

describe("trajectory (lower-is-better series)", () => {
  it("detects improvement, worsening, flat", () => {
    expect(trajectory([0.3, 0.2, 0.1]).direction).toBe("improving");
    expect(trajectory([0.1, 0.2]).direction).toBe("worsening");
    expect(trajectory([0.2, 0.2]).direction).toBe("flat");
  });
  it("skips nulls and needs >= 2 real points", () => {
    expect(trajectory([null, 0.3, null, 0.1])).toMatchObject({
      n: 2,
      direction: "improving",
    });
    expect(trajectory([0.2]).direction).toBe("insufficient");
    expect(trajectory([]).direction).toBe("insufficient");
  });
});
