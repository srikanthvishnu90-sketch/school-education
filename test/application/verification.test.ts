import { beforeEach, describe, expect, it } from "vitest";

import type { Assessment } from "@/domain";
import type { ActionVerification } from "@/domain";
import type { Clock } from "@/domain/ports";
import {
  createActionVerificationRepository,
  createAssessmentRepository,
  createOutcomeRepository,
  createPredictionRepository,
  createReflectionRepository,
  createSequentialIdGenerator,
  createTransferProbeRepository,
  createAffectRepository,
  createGoalRepository,
} from "@/adapters/memory";
import {
  NotFoundError,
  createServices,
  createVerificationService,
  repeatedlyRegressedSkills,
  type Services,
  type VerificationService,
} from "@/application";
import type { ActionVerificationRepository } from "@/domain/ports";

/**
 * The verification service SELECTS the follow-up and persists; the pure domain
 * decides the verdict. These tests pin the selection rules that matter: bind to
 * the next assessment that MEASURES the skill (skip the ones that don't), keep
 * accuracy and calibration verdicts independent, never credit an untargeted skill
 * (the confound guard), and expire — never guess — when the skill is not re-tested
 * in time. Everything is driven by an injected clock, so it is fully deterministic.
 */

const STUDENT = "s1";
const TARGET = "skill-linear";
const OTHER = "skill-slope";
const START = Date.UTC(2026, 0, 5, 9, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

/** An assessment with `count` items per skill, tagged in order. */
function assessment(
  id: string,
  groups: { skillId: string; count: number }[],
): Assessment {
  const items = [];
  let k = 0;
  for (const { skillId, count } of groups) {
    for (let i = 0; i < count; i++) {
      k += 1;
      items.push({
        id: `${id}-i${k}`,
        assessmentId: id,
        skillId,
        prompt: "?",
        maxPoints: 1,
      });
    }
  }
  return { id, title: id, createdAt: new Date(START), items };
}

let services: Services;
let verification: VerificationService;
let verifications: ActionVerificationRepository;
let now: Date;
let clock: Clock;

function advance(ms: number): void {
  now = new Date(now.getTime() + ms);
}

beforeEach(() => {
  now = new Date(START);
  clock = { now: () => new Date(now.getTime()) };
  const ids = createSequentialIdGenerator();
  const assessments = createAssessmentRepository();
  const predictions = createPredictionRepository();
  const outcomes = createOutcomeRepository();
  verifications = createActionVerificationRepository();

  services = createServices({
    clock,
    ids,
    assessments,
    goals: createGoalRepository(),
    predictions,
    outcomes,
    reflections: createReflectionRepository(),
    transferProbes: createTransferProbeRepository(),
    affects: createAffectRepository(),
  });

  verification = createVerificationService({
    clock,
    ids,
    assessments,
    predictions,
    outcomes,
    verifications,
  });

  // The assessments live behind the same repo the services read.
  saveAssessment = (a: Assessment) => assessments.save(a);
});

let saveAssessment: (a: Assessment) => Promise<void>;

/**
 * Records a full evidence cycle (prediction pre-registered, then outcome) for the
 * student on one assessment. `correct(idx)` decides each item, in item order.
 * Confidence is a constant 0.5 so Brier is a fixed 0.25 per item — that isolates
 * accuracy movement from calibration movement.
 */
async function recordEvidence(
  a: Assessment,
  correct: (index: number) => boolean,
): Promise<void> {
  advance(60_000);
  await services.capturePrediction({
    studentId: STUDENT,
    assessmentId: a.id,
    itemPredictions: a.items.map((it) => ({ itemId: it.id, confidence: 0.5 })),
    globalPredicted: 0.5,
  });
  advance(60_000);
  await services.recordOutcome({
    studentId: STUDENT,
    assessmentId: a.id,
    itemOutcomes: a.items.map((it, idx) => ({
      itemId: it.id,
      correct: correct(idx),
      pointsAwarded: correct(idx) ? 1 : 0,
    })),
  });
}

/** correctness helper: the first `k` items correct, the rest wrong. */
const firstK = (k: number) => (idx: number) => idx < k;

describe("follow-up selection", () => {
  it("binds to the next assessment CONTAINING the skill, skipping ones that don't", async () => {
    const a0 = assessment("a0", [{ skillId: TARGET, count: 4 }]);
    const a1 = assessment("a1", [{ skillId: OTHER, count: 4 }]); // no target skill
    const a2 = assessment("a2", [{ skillId: TARGET, count: 4 }]);
    await saveAssessment(a0);
    await saveAssessment(a1);
    await saveAssessment(a2);

    await recordEvidence(a0, firstK(1)); // baseline accuracy 0.25
    const opened = await verification.openForAction({
      nextActionId: "ref-1",
      studentId: STUDENT,
      targetSkillId: TARGET,
      baselineAssessmentId: "a0",
    });
    expect(opened.accuracyVerdict).toBe("pending");

    // An intervening assessment that does NOT measure the skill must be skipped.
    await recordEvidence(a1, firstK(4));
    const afterA1 = await verification.onNewEvidence("a1", STUDENT);
    expect(afterA1).toHaveLength(0);
    expect((await verifications.findById(opened.id))?.closedAt).toBeUndefined();

    // The next assessment that DOES measure the skill binds.
    await recordEvidence(a2, firstK(3)); // follow-up accuracy 0.75
    const afterA2 = await verification.onNewEvidence("a2", STUDENT);
    expect(afterA2).toHaveLength(1);
    const bound = afterA2[0];
    expect(bound.followupAssessmentId).toBe("a2");
    expect(bound.accuracyVerdict).toBe("improved");
    expect(bound.closedAt).toBeInstanceOf(Date);
  });
});

describe("independent verdicts", () => {
  it("accuracy up but calibration flat → improved / flat", async () => {
    const a0 = assessment("a0", [{ skillId: TARGET, count: 4 }]);
    const a2 = assessment("a2", [{ skillId: TARGET, count: 4 }]);
    await saveAssessment(a0);
    await saveAssessment(a2);

    await recordEvidence(a0, firstK(1)); // accuracy 0.25, brier 0.25 (conf 0.5)
    await verification.openForAction({
      nextActionId: "ref-1",
      studentId: STUDENT,
      targetSkillId: TARGET,
      baselineAssessmentId: "a0",
    });
    await recordEvidence(a2, firstK(3)); // accuracy 0.75, brier 0.25 (unchanged)
    const [bound] = await verification.onNewEvidence("a2", STUDENT);

    expect(bound.accuracyVerdict).toBe("improved");
    expect(bound.calibrationVerdict).toBe("flat");
  });
});

describe("confound guard", () => {
  it("does not credit an untargeted skill that improved the same cycle", async () => {
    const a0 = assessment("a0", [{ skillId: TARGET, count: 4 }]);
    // The follow-up measures BOTH skills; the untargeted one aces it.
    const a2 = assessment("a2", [
      { skillId: TARGET, count: 4 },
      { skillId: OTHER, count: 4 },
    ]);
    await saveAssessment(a0);
    await saveAssessment(a2);

    await recordEvidence(a0, firstK(3)); // target baseline accuracy 0.75
    await verification.openForAction({
      nextActionId: "ref-1",
      studentId: STUDENT,
      targetSkillId: TARGET,
      baselineAssessmentId: "a0",
    });
    // Target items (0-3): 1 correct → 0.25 (regressed). Other items (4-7): all correct.
    await recordEvidence(a2, (idx) => idx === 0 || idx >= 4);
    const [bound] = await verification.onNewEvidence("a2", STUDENT);

    // The target regressed; the other skill's success is NOT credited.
    expect(bound.accuracyVerdict).toBe("regressed");
    // It is logged as drift for honesty, never folded into the verdict.
    expect(bound.untargetedDrift).toEqual([{ skillId: OTHER, accuracy: 1 }]);
  });
});

describe("staleness", () => {
  it("expires as inconclusive when the skill is not re-tested within the horizon", async () => {
    const a0 = assessment("a0", [{ skillId: TARGET, count: 4 }]);
    const aLate = assessment("a-late", [{ skillId: OTHER, count: 4 }]);
    await saveAssessment(a0);
    await saveAssessment(aLate);

    await recordEvidence(a0, firstK(1));
    const opened = await verification.openForAction({
      nextActionId: "ref-1",
      studentId: STUDENT,
      targetSkillId: TARGET,
      baselineAssessmentId: "a0",
    });

    // 31 days later, evidence arrives that does NOT re-test the skill.
    advance(31 * DAY_MS);
    await recordEvidence(aLate, firstK(4));
    const [expired] = await verification.onNewEvidence("a-late", STUDENT);

    expect(expired.id).toBe(opened.id);
    expect(expired.accuracyVerdict).toBe("inconclusive");
    expect(expired.calibrationVerdict).toBe("inconclusive");
    expect(expired.followup).toBeUndefined();
    expect(expired.closedAt).toBeInstanceOf(Date);
  });
});

describe("thin evidence", () => {
  it("too few items on the baseline → inconclusive, never a false verdict", async () => {
    const a0 = assessment("a0", [{ skillId: TARGET, count: 2 }]); // only 2 items
    const a2 = assessment("a2", [{ skillId: TARGET, count: 4 }]);
    await saveAssessment(a0);
    await saveAssessment(a2);

    await recordEvidence(a0, firstK(1));
    await verification.openForAction({
      nextActionId: "ref-1",
      studentId: STUDENT,
      targetSkillId: TARGET,
      baselineAssessmentId: "a0",
    });
    await recordEvidence(a2, firstK(3));
    const [bound] = await verification.onNewEvidence("a2", STUDENT);

    expect(bound.accuracyVerdict).toBe("inconclusive");
    expect(bound.calibrationVerdict).toBe("inconclusive");
    // It is a MEASURED inconclusive (a follow-up was bound), not an expiry.
    expect(bound.followupAssessmentId).toBe("a2");
  });

  it("rejects opening a verification whose baseline never measured the skill", async () => {
    const a0 = assessment("a0", [{ skillId: OTHER, count: 4 }]);
    await saveAssessment(a0);
    await recordEvidence(a0, firstK(4));
    await expect(
      verification.openForAction({
        nextActionId: "ref-1",
        studentId: STUDENT,
        targetSkillId: TARGET, // not measured on a0
        baselineAssessmentId: "a0",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("determinism", () => {
  it("same evidence + injected clock → identical verification", async () => {
    async function run(): Promise<ActionVerification> {
      now = new Date(START);
      clock = { now: () => new Date(now.getTime()) };
      const ids = createSequentialIdGenerator();
      const assessments = createAssessmentRepository();
      const predictions = createPredictionRepository();
      const outcomes = createOutcomeRepository();
      const verifs = createActionVerificationRepository();
      services = createServices({
        clock,
        ids,
        assessments,
        goals: createGoalRepository(),
        predictions,
        outcomes,
        reflections: createReflectionRepository(),
        transferProbes: createTransferProbeRepository(),
        affects: createAffectRepository(),
      });
      const svc = createVerificationService({
        clock,
        ids,
        assessments,
        predictions,
        outcomes,
        verifications: verifs,
      });
      saveAssessment = (a) => assessments.save(a);

      const a0 = assessment("a0", [{ skillId: TARGET, count: 4 }]);
      const a2 = assessment("a2", [{ skillId: TARGET, count: 4 }]);
      await saveAssessment(a0);
      await saveAssessment(a2);
      await recordEvidence(a0, firstK(1));
      await svc.openForAction({
        nextActionId: "ref-1",
        studentId: STUDENT,
        targetSkillId: TARGET,
        baselineAssessmentId: "a0",
      });
      await recordEvidence(a2, firstK(3));
      const [bound] = await svc.onNewEvidence("a2", STUDENT);
      return bound;
    }

    expect(await run()).toEqual(await run());
  });
});

describe("repeatedlyRegressedSkills", () => {
  function verif(
    targetSkillId: string,
    accuracyVerdict: ActionVerification["accuracyVerdict"],
    id: string,
  ): ActionVerification {
    return {
      id,
      nextActionId: `${id}-ref`,
      studentId: STUDENT,
      targetSkillId,
      openedAt: new Date(START),
      baseline: { skillId: targetSkillId, accuracy: 0.5, brier: 0.25, itemCount: 4 },
      baselineAssessmentId: "a0",
      accuracyVerdict,
      calibrationVerdict: "flat",
      closedAt: new Date(START),
    };
  }

  it("names only skills with at least `min` regressed accuracy verdicts", () => {
    const records = [
      verif(TARGET, "regressed", "v1"),
      verif(TARGET, "regressed", "v2"),
      verif(OTHER, "regressed", "v3"), // only once → not escalated
      verif(TARGET, "improved", "v4"),
    ];
    expect(repeatedlyRegressedSkills(records, 2)).toEqual([TARGET]);
  });

  it("ignores non-accuracy signals (an inconclusive is not a regression)", () => {
    const records = [
      verif(TARGET, "inconclusive", "v1"),
      verif(TARGET, "inconclusive", "v2"),
    ];
    expect(repeatedlyRegressedSkills(records, 2)).toEqual([]);
  });
});
