import { describe, expect, it } from "vitest";

import {
  UNTAGGED_SKILL_ID,
  assessEvidence,
  computeCalibration,
  decideEligibility,
  gateByCapabilities,
  predictionCoversOutcome,
  type AssessmentItem,
  type EligibilityDecision,
  type EvidenceInput,
} from "@/domain";
import { T_SCORE, makeOutcome, makePrediction } from "../fixtures/domain";

/**
 * The eligibility gate — the deterministic judgment of the evidence pipeline.
 * Pure unit tests, no infrastructure, no LLM anywhere in this path.
 */

const item = (id: string, skillId: string): AssessmentItem => ({
  id,
  assessmentId: "assess-1",
  skillId,
  prompt: `prompt for ${id}`,
  maxPoints: 1,
});

const TAGGED_ITEMS = [item("item-1", "skill-a"), item("item-2", "skill-b")];
const UNTAGGED_ITEMS = [
  item("item-1", UNTAGGED_SKILL_ID),
  item("item-2", UNTAGGED_SKILL_ID),
];

const input = (overrides: Partial<EvidenceInput> = {}): EvidenceInput => ({
  prediction: makePrediction(),
  outcome: makeOutcome(),
  items: TAGGED_ITEMS,
  totals: null,
  ...overrides,
});

describe("predictionCoversOutcome", () => {
  it("is true when every scored item was pre-registered", () => {
    expect(predictionCoversOutcome(makePrediction(), makeOutcome())).toBe(true);
  });

  it("is false when a scored item was never predicted", () => {
    const outcome = makeOutcome({
      itemOutcomes: [
        ...makeOutcome().itemOutcomes,
        { itemId: "item-3", correct: true, pointsAwarded: 1 },
      ],
    });
    expect(predictionCoversOutcome(makePrediction(), outcome)).toBe(false);
  });

  it("is vacuously true for a total-only outcome (no items to cover)", () => {
    expect(
      predictionCoversOutcome(makePrediction(), makeOutcome({ itemOutcomes: [] })),
    ).toBe(true);
  });
});

describe("decideEligibility", () => {
  it("prior prediction + item data + skill tags → full (calibration + perSkill)", () => {
    const decision = decideEligibility(input());
    expect(decision.level).toBe("full");
    expect(decision.calibrationEligible).toBe(true);
    expect(decision.perSkillEligible).toBe(true);
  });

  it("no prior prediction → baseline only, never calibration", () => {
    const decision = decideEligibility(input({ prediction: null }));
    expect(decision.level).toBe("baseline");
    expect(decision.calibrationEligible).toBe(false);
    expect(decision.reasons[0]).toContain("no pre-registered prediction");
  });

  it("a prediction made AFTER the score is known → baseline (pre-registration is the point)", () => {
    const decision = decideEligibility(
      input({ prediction: makePrediction({ createdAt: T_SCORE }) }),
    );
    expect(decision.level).toBe("baseline");
    expect(decision.reasons[0]).toContain("strictly before");
  });

  it("a prediction that does not cover the scored items → baseline", () => {
    const outcome = makeOutcome({
      itemOutcomes: [{ itemId: "item-9", correct: true, pointsAwarded: 1 }],
    });
    const decision = decideEligibility(input({ outcome }));
    expect(decision.level).toBe("baseline");
    expect(decision.reasons[0]).toContain("does not cover");
  });

  it("item data with zero skill tags → item level (perSkill withheld)", () => {
    const decision = decideEligibility(input({ items: UNTAGGED_ITEMS }));
    expect(decision.level).toBe("item");
    expect(decision.calibrationEligible).toBe(true);
    expect(decision.perSkillEligible).toBe(false);
  });

  it("total-only evidence with a prior prediction → global level", () => {
    const decision = decideEligibility(
      input({
        outcome: makeOutcome({ itemOutcomes: [] }),
        items: [],
        totals: { pointsAwarded: 13, maxPoints: 20 },
      }),
    );
    expect(decision.level).toBe("global");
    expect(decision.perSkillEligible).toBe(false);
  });

  it("no items and no totals → baseline (nothing to reconcile against)", () => {
    const decision = decideEligibility(
      input({ outcome: makeOutcome({ itemOutcomes: [] }), items: [], totals: null }),
    );
    expect(decision.level).toBe("baseline");
  });
});

describe("assessEvidence", () => {
  it("full: runs the existing calibration engine and the per-skill breakdown", () => {
    const evidence = input();
    const { decision, calibration } = assessEvidence(evidence);

    expect(decision.level).toBe("full");
    expect(calibration).not.toBeNull();
    // Never reimplements the math: identical to computeCalibration.
    expect(calibration?.summary).toEqual(
      computeCalibration(makePrediction(), makeOutcome()),
    );
    expect(calibration?.perSkill?.map((s) => s.skillId)).toEqual([
      "skill-a",
      "skill-b",
    ]);
  });

  it("item: summary computed, perSkill null — globalGap works with zero tags", () => {
    const { calibration } = assessEvidence(input({ items: UNTAGGED_ITEMS }));
    expect(calibration?.summary.brier).not.toBeNull();
    expect(calibration?.summary.globalGap).not.toBeNull();
    expect(calibration?.perSkill).toBeNull();
  });

  it("global: globalGap set from the assignment total; every item metric stays null", () => {
    const { calibration } = assessEvidence(
      input({
        outcome: makeOutcome({ itemOutcomes: [] }),
        items: [],
        totals: { pointsAwarded: 13, maxPoints: 20 },
      }),
    );
    expect(calibration?.summary.globalGap).toBeCloseTo(0.7 - 13 / 20, 10);
    expect(calibration?.summary.brier).toBeNull();
    expect(calibration?.summary.bias).toBeNull();
    expect(calibration?.summary.accuracy).toBeNull();
    expect(calibration?.perSkill).toBeNull();
  });

  it("baseline: no calibration at all", () => {
    const { calibration } = assessEvidence(input({ prediction: null }));
    expect(calibration).toBeNull();
  });

  it("is deterministic: same evidence, same assessment", () => {
    expect(assessEvidence(input())).toEqual(assessEvidence(input()));
  });

  it("mixed tagging: untagged items are excluded from perSkill rather than invented", () => {
    const items = [item("item-1", "skill-a"), item("item-2", UNTAGGED_SKILL_ID)];
    const { decision, calibration } = assessEvidence(input({ items }));
    expect(decision.level).toBe("full");
    expect(calibration?.perSkill?.map((s) => s.skillId)).toEqual(["skill-a"]);
    // The summary still covers ALL matched items.
    expect(calibration?.summary.n).toBe(2);
  });
});

describe("gateByCapabilities — declared flags cap the ladder (P8)", () => {
  const full: EligibilityDecision = {
    level: "full",
    calibrationEligible: true,
    perSkillEligible: true,
    reasons: ["base"],
  };

  it("skillTags=false downgrades full → item (per-skill withheld)", () => {
    const gated = gateByCapabilities(full, {
      itemLevel: true,
      skillTags: false,
      attendance: false,
    });
    expect(gated.level).toBe("item");
    expect(gated.perSkillEligible).toBe(false);
    expect(gated.calibrationEligible).toBe(true);
  });

  it("itemLevel=false downgrades any item/full → global", () => {
    const gated = gateByCapabilities(full, {
      itemLevel: false,
      skillTags: true,
      attendance: false,
    });
    expect(gated.level).toBe("global");
    expect(gated.perSkillEligible).toBe(false);
  });

  it("leaves a decision that already fits within the capabilities untouched", () => {
    const gated = gateByCapabilities(full, {
      itemLevel: true,
      skillTags: true,
      attendance: false,
    });
    expect(gated).toBe(full);
  });

  it("never UPGRADES: a baseline stays baseline regardless of flags", () => {
    const baseline: EligibilityDecision = {
      level: "baseline",
      calibrationEligible: false,
      perSkillEligible: false,
      reasons: ["no prediction"],
    };
    expect(
      gateByCapabilities(baseline, {
        itemLevel: true,
        skillTags: true,
        attendance: true,
      }).level,
    ).toBe("baseline");
  });
});
