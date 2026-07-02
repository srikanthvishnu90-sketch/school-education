import { describe, expect, it } from "vitest";

import type { CalibrationSummary, SkillCalibration } from "@/domain";
import type { Reflection } from "@/domain";
import {
  interventionPolicy,
  worstOverconfidentSkill,
  LOW_GRANULARITY_MAX,
  PERSISTENT_GAP_MIN,
  SEVERE_GLOBAL_GAP,
  POLICY_EPS,
  type AgentObservation,
} from "@/application/agent";

/**
 * The InterventionPolicy is the ONLY decision point in the agent, and it is a
 * pure function. These tests pin (a) every priority branch, (b) the ordering
 * between branches that can co-fire, and (c) that the function is synchronous
 * and single-argument — the structural guarantee that no LLM, clock, or I/O can
 * sit in the decision path.
 */

const T_FUTURE = new Date(Date.UTC(2026, 5, 1));

function calibration(
  over: Partial<CalibrationSummary> = {},
): CalibrationSummary {
  return {
    n: 4,
    brier: 0.1,
    meanConfidence: 0.6,
    accuracy: 0.6,
    bias: 0,
    discrimination: 0.2,
    globalGap: 0,
    ...over,
  };
}

function skill(skillId: string, bias: number): SkillCalibration {
  return {
    skillId,
    n: 2,
    brier: 0.2,
    meanConfidence: 0.8,
    accuracy: 0.8 - bias,
    bias,
    discrimination: 0.1,
  };
}

/** A productive reflection whose next action is NOT overdue — a benign default. */
function productiveReflection(): Reflection {
  return {
    id: "r",
    assessmentId: "a",
    studentId: "s",
    attribution: {
      category: "strategy",
      specific: true,
      controllable: true,
      note: "I skipped checking my work on the slope items.",
    },
    nextAction: { text: "re-do the two slope items showing work", dueBy: T_FUTURE },
    exemplarReviewed: true,
    createdAt: new Date(Date.UTC(2026, 0, 5)),
  };
}

function nonProductiveReflection(): Reflection {
  return {
    id: "r",
    assessmentId: "a",
    studentId: "s",
    attribution: {
      category: "ability",
      specific: false,
      controllable: false,
      note: "I'm just bad at math.",
    },
    nextAction: { text: "n/a", dueBy: T_FUTURE },
    exemplarReviewed: false,
    createdAt: new Date(Date.UTC(2026, 0, 5)),
  };
}

/** A calm, well-calibrated, feeling-differentiated snapshot: nothing acute. */
function baseObservation(): AgentObservation {
  return {
    assessmentId: "a",
    studentId: "s",
    calibration: calibration(),
    perSkill: [],
    congruence: { gap: 0, classification: "congruent" },
    granularity: 3,
    reflection: null,
    displayedMisconception: false,
    action: null,
    priorGapCount: 0,
  };
}

describe("interventionPolicy — structural purity", () => {
  it("is a synchronous, single-argument function (no LLM/clock/IO in the path)", () => {
    // Exactly one parameter (the observation) — no injected capability, clock, or model.
    expect(interventionPolicy.length).toBe(1);
    const decision = interventionPolicy(baseObservation());
    // Returns a plain decision, not a Promise — the decision cannot await a model.
    expect(decision).not.toBeInstanceOf(Promise);
    expect(typeof decision.intervention).toBe("string");
  });

  it("is deterministic: same observation → identical decision", () => {
    const observation = baseObservation();
    observation.perSkill = [skill("skill-slope", 0.4)];
    expect(interventionPolicy(observation)).toEqual(
      interventionPolicy(observation),
    );
  });
});

describe("interventionPolicy — each priority branch", () => {
  it("1. non-productive reflection → require_redecomposition", () => {
    const o = baseObservation();
    o.reflection = nonProductiveReflection();
    // Even with an overconfident skill present, re-decomposition wins (rank 1).
    o.perSkill = [skill("skill-slope", 0.5)];
    expect(interventionPolicy(o).intervention).toBe("require_redecomposition");
  });

  it("2. overconfident skill → serve_probe on the WORST skill", () => {
    const o = baseObservation();
    o.reflection = productiveReflection();
    o.perSkill = [skill("skill-linear", 0.2), skill("skill-slope", 0.5)];
    const decision = interventionPolicy(o);
    expect(decision.intervention).toBe("serve_probe");
    expect(decision.targetSkillId).toBe("skill-slope");
  });

  it("3. over_positive + low granularity → build_granularity (no overconfidence)", () => {
    const o = baseObservation();
    o.perSkill = []; // calibration is fine; the issue is purely emotional
    o.congruence = { gap: 1.4, classification: "over_positive" };
    o.granularity = LOW_GRANULARITY_MAX;
    expect(interventionPolicy(o).intervention).toBe("build_granularity");
  });

  it("4. displayed misconception → surface_exemplar", () => {
    const o = baseObservation();
    o.displayedMisconception = true;
    expect(interventionPolicy(o).intervention).toBe("surface_exemplar");
  });

  it("5. overdue action → check_action_followthrough", () => {
    const o = baseObservation();
    o.action = { overdue: true };
    expect(interventionPolicy(o).intervention).toBe(
      "check_action_followthrough",
    );
  });

  it("6a. persistent gap → flag_to_teacher (support, not surveillance)", () => {
    const o = baseObservation();
    o.priorGapCount = PERSISTENT_GAP_MIN;
    expect(interventionPolicy(o).intervention).toBe("flag_to_teacher");
  });

  it("6b. severe single-shot gap → flag_to_teacher", () => {
    const o = baseObservation();
    o.calibration = calibration({ globalGap: -SEVERE_GLOBAL_GAP });
    expect(interventionPolicy(o).intervention).toBe("flag_to_teacher");
  });

  it("7. nothing acute → schedule_reengagement", () => {
    expect(interventionPolicy(baseObservation()).intervention).toBe(
      "schedule_reengagement",
    );
  });
});

describe("interventionPolicy — ordering between co-firing branches", () => {
  it("academic overconfidence outranks purely-emotional over-positivity", () => {
    // Both branch 2 and branch 3 are satisfied; the probe (reality first) must win.
    const o = baseObservation();
    o.perSkill = [skill("skill-slope", 0.3)];
    o.congruence = { gap: 1.4, classification: "over_positive" };
    o.granularity = 1;
    expect(interventionPolicy(o).intervention).toBe("serve_probe");
  });

  it("a misconception outranks an overdue action", () => {
    const o = baseObservation();
    o.displayedMisconception = true;
    o.action = { overdue: true };
    expect(interventionPolicy(o).intervention).toBe("surface_exemplar");
  });
});

describe("worstOverconfidentSkill", () => {
  it("returns the largest positive bias above eps, or null", () => {
    expect(worstOverconfidentSkill([])).toBeNull();
    // A bias at/under eps is not overconfident.
    expect(worstOverconfidentSkill([skill("s1", POLICY_EPS)])).toBeNull();
    // Underconfidence is never a probe target.
    expect(worstOverconfidentSkill([skill("s1", -0.4)])).toBeNull();
    const worst = worstOverconfidentSkill([
      skill("s1", 0.2),
      skill("s2", 0.6),
      skill("s3", 0.3),
    ]);
    expect(worst?.skillId).toBe("s2");
  });

  it("ignores skills with a null bias", () => {
    const nullBias: SkillCalibration = { ...skill("s0", 0), bias: null };
    expect(worstOverconfidentSkill([nullBias])).toBeNull();
  });
});
