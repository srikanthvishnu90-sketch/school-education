import { describe, expect, it } from "vitest";

import {
  createActionVerificationRepository,
  createAffectRepository,
  createAssessmentRepository,
  createCalibrationRepository,
  createFlagAcknowledgementRepository,
  createGoalRepository,
  createOutcomeRepository,
  createPredictionRepository,
  createReflectionRepository,
  createSequentialClock,
} from "@/adapters/memory";
import {
  aggregateCalibration,
  aggregateFollowThrough,
  createObserver,
  createTeacherService,
  flagPattern,
} from "@/application";
import {
  createAssessment,
  createCalibrationRecord,
  createOutcome,
  createPrediction,
  type ActionVerification,
} from "@/domain";

const SKILL_NAMES = {
  "skill-linear": "linear equations",
  "skill-slope": "interpreting slope",
};

const FORBIDDEN = [
  "bad at",
  "not good",
  "stupid",
  "dumb",
  "smart",
  "talent",
  "gifted",
  "failure",
  "ability",
  "overconfident student",
];

describe("aggregateCalibration — min-N gate + sorting", () => {
  const contributions = [
    { skillId: "skill-linear", bias: 0.4, accuracy: 0.5 },
    { skillId: "skill-linear", bias: 0.2, accuracy: 0.6 },
    { skillId: "skill-slope", bias: -0.05, accuracy: 0.7 }, // only one → below min-N
  ];

  it("suppresses the estimate below min-N, keeps the count", () => {
    const rows = aggregateCalibration(contributions, SKILL_NAMES, 2);
    const slope = rows.find((r) => r.skillId === "skill-slope")!;
    expect(slope.sufficient).toBe(false);
    expect(slope.meanBias).toBeNull();
    expect(slope.n).toBe(1);
  });

  it("sorts most-blindsided first; insufficient rows sink", () => {
    const rows = aggregateCalibration(contributions, SKILL_NAMES, 2);
    expect(rows[0].skillId).toBe("skill-linear");
    expect(rows[0].meanBias).toBeCloseTo(0.3, 10);
    expect(rows.at(-1)!.skillId).toBe("skill-slope");
  });
});

describe("aggregateFollowThrough", () => {
  function v(verdict: ActionVerification["accuracyVerdict"]): ActionVerification {
    return {
      id: `v-${verdict}`,
      nextActionId: "r",
      studentId: "s",
      targetSkillId: "skill-linear",
      openedAt: new Date("2026-01-01"),
      baseline: { skillId: "skill-linear", accuracy: 0.5, brier: 0.2, itemCount: 4 },
      baselineAssessmentId: "a",
      accuracyVerdict: verdict,
      calibrationVerdict: "flat",
      closedAt: new Date("2026-01-02"),
    };
  }
  it("counts verdicts and computes resolved %", () => {
    const ft = aggregateFollowThrough([v("improved"), v("flat"), v("regressed"), { ...v("improved"), id: "v-pending", accuracyVerdict: "pending" }]);
    expect(ft.total).toBe(4);
    expect(ft.improved).toBe(1);
    expect(ft.regressed).toBe(1);
    expect(ft.resolvedPct).toBe(75); // 3 of 4 reached a real verdict
  });
});

describe("flagPattern — task language, never the child", () => {
  it("describes the work, no self-referential words, no exclamation", () => {
    const text = flagPattern("quadratics", 0.5);
    expect(text).toContain("far apart on quadratics");
    for (const w of FORBIDDEN) expect(text.toLowerCase()).not.toContain(w);
    expect(text).not.toContain("!");
  });
});

describe("teacher flags — raised for a persistent gap, cleared on acknowledge", () => {
  const A = "assess-1";
  const S = "student-x";

  function build() {
    const clock = createSequentialClock(Date.UTC(2026, 0, 5));
    const assessments = createAssessmentRepository();
    const predictions = createPredictionRepository();
    const outcomes = createOutcomeRepository();
    const calibrations = createCalibrationRepository();
    const flagAcks = createFlagAcknowledgementRepository();
    const observer = createObserver({
      clock,
      assessments,
      predictions,
      outcomes,
      goals: createGoalRepository(),
      affects: createAffectRepository(),
      reflections: createReflectionRepository(),
      calibrations,
      verifications: createActionVerificationRepository(),
      flagAcks,
    });
    const service = createTeacherService({
      assessments,
      predictions,
      outcomes,
      verifications: createActionVerificationRepository(),
      flagAcks,
      observer,
      clock,
      skillNames: SKILL_NAMES,
      minN: 1,
    });
    return { assessments, predictions, outcomes, calibrations, service };
  }

  it("flags a persistently-gapped student in task language, then suppresses after acknowledge", async () => {
    const { assessments, predictions, outcomes, calibrations, service } = build();
    await assessments.save(
      createAssessment({
        id: A,
        title: "t",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
        items: [
          { id: "i1", assessmentId: A, skillId: "skill-linear", prompt: "?", maxPoints: 1 },
          { id: "i2", assessmentId: A, skillId: "skill-linear", prompt: "?", maxPoints: 1 },
        ],
      }),
    );
    await predictions.save(
      createPrediction({
        id: "p",
        assessmentId: A,
        studentId: S,
        itemPredictions: [
          { itemId: "i1", confidence: 0.9 },
          { itemId: "i2", confidence: 0.9 },
        ],
        globalPredicted: 0.9,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      }),
    );
    await outcomes.save(
      createOutcome({
        id: "o",
        assessmentId: A,
        studentId: S,
        itemOutcomes: [
          { itemId: "i1", correct: false, pointsAwarded: 0 },
          { itemId: "i2", correct: false, pointsAwarded: 0 },
        ],
        scoredAt: new Date("2026-01-01T11:00:00.000Z"),
      }),
    );
    // Two prior gaps → persistent → the agent flags to the teacher.
    for (const [i, bias] of [0.4, 0.4].entries()) {
      await calibrations.save(
        createCalibrationRecord({
          id: `c${i}`,
          assessmentId: A,
          studentId: S,
          brier: 0.3,
          bias,
          resolution: 0.1,
          itemCount: 2,
          computedAt: new Date("2026-01-01T09:00:00.000Z"),
        }),
      );
    }

    const before = await service.flags(A, [S]);
    expect(before).toHaveLength(1);
    expect(before[0].pattern).toContain("far apart on linear equations");
    for (const w of FORBIDDEN) {
      expect(before[0].pattern.toLowerCase()).not.toContain(w);
    }

    await service.acknowledge(S, "teacher-1");
    const after = await service.flags(A, [S]);
    expect(after).toHaveLength(0);
  });
});
