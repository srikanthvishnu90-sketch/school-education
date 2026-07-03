import { beforeEach, describe, expect, it } from "vitest";

import type {
  ActionVerification,
  AffectSnapshot,
  CalibrationRecord,
  CohortWindow,
} from "@/domain";
import type {
  ActionVerificationRepository,
  AffectRepository,
  CalibrationRepository,
  Clock,
} from "@/domain/ports";
import {
  createActionVerificationRepository,
  createAffectRepository,
  createCalibrationRepository,
} from "@/adapters/memory";
import { createEfficacyService, type EfficacyService } from "@/application";

/**
 * The efficacy service assembles cohort reports from per-student P7/P3 artifacts
 * and caps the claim at the design that exists. These tests drive it with an
 * injected clock so the staggered comparison is fully deterministic.
 */

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-02-01T00:00:00.000Z");
const CUTOFF = new Date("2026-01-16T12:00:00.000Z"); // midpoint of the window

let calibrations: CalibrationRepository;
let verifications: ActionVerificationRepository;
let affects: AffectRepository;
let now: Date;
let service: EfficacyService;

function calibration(
  studentId: string,
  bias: number,
  computedAt: Date,
): CalibrationRecord {
  return {
    id: `cal-${studentId}-${computedAt.getTime()}`,
    assessmentId: `a-${computedAt.getTime()}`,
    studentId,
    brier: 0.2,
    bias,
    resolution: 0.1,
    itemCount: 4,
    computedAt,
  };
}

function closedVerification(studentId: string, openedAt: Date): ActionVerification {
  return {
    id: `v-${studentId}-${openedAt.getTime()}`,
    nextActionId: `ref-${studentId}`,
    studentId,
    targetSkillId: "skill-linear",
    openedAt,
    baseline: { skillId: "skill-linear", accuracy: 0.5, brier: 0.2, itemCount: 4 },
    baselineAssessmentId: "a-0",
    accuracyVerdict: "improved",
    calibrationVerdict: "flat",
    closedAt: new Date(openedAt.getTime() + 1000),
  };
}

function affect(studentId: string, createdAt: Date): AffectSnapshot {
  return {
    id: `aff-${studentId}`,
    assessmentId: "a-0",
    studentId,
    labels: [
      { term: "focused", valence: 0.2, arousal: 0.6 },
      { term: "calm", valence: 0.3, arousal: 0.15 },
    ],
    phase: "post_evidence",
    createdAt,
  };
}

/** Save an entry + final calibration pair, one closed cycle, and an entry affect. */
async function saveStudent(
  studentId: string,
  entryBias: number,
  finalBias: number,
  finalAt: Date,
): Promise<void> {
  await calibrations.save(calibration(studentId, entryBias, new Date("2026-01-02T00:00:00.000Z")));
  await calibrations.save(calibration(studentId, finalBias, finalAt));
  await verifications.save(closedVerification(studentId, new Date("2026-01-05T00:00:00.000Z")));
  await affects.save(affect(studentId, new Date("2026-01-02T00:00:00.000Z")));
}

beforeEach(() => {
  calibrations = createCalibrationRepository();
  verifications = createActionVerificationRepository();
  affects = createAffectRepository();
  now = new Date("2026-03-01T00:00:00.000Z");
  const clock: Clock = { now: () => new Date(now.getTime()) };
  service = createEfficacyService({
    clock,
    calibrations,
    verifications,
    affects,
    config: { minN: 3, reversionReliability: 0.5, extremeEntryThreshold: 0.15 },
  });
});

describe("cohortReport", () => {
  it("is associational (never quasi), reports attrition + baseline covariates", async () => {
    // Two completers (final observation after the cutoff), two dropouts (before).
    await saveStudent("s1", 0.4, 0.1, new Date("2026-01-25T00:00:00.000Z"));
    await saveStudent("s2", 0.4, 0.1, new Date("2026-01-25T00:00:00.000Z"));
    await saveStudent("s3", 0.4, 0.38, new Date("2026-01-08T00:00:00.000Z"));
    await saveStudent("s4", 0.4, 0.38, new Date("2026-01-08T00:00:00.000Z"));

    const window: CohortWindow = {
      cohortId: "cohort-a",
      from: FROM,
      to: TO,
      studentIds: ["s1", "s2", "s3", "s4"],
    };
    const report = await service.cohortReport(window);

    expect(report.grade).toBe("associational");
    expect(report.grade).not.toBe("quasi_experimental");
    expect(report.n).toBe(4);
    expect(report.attrition.startingN).toBe(4);
    expect(report.attrition.completersN).toBe(2);
    expect(report.attrition.survivorshipBias).not.toBeNull();
    // Entry-granularity covariate assembled from the affect snapshots.
    expect(report.baseline.meanEntryGranularity).toBeGreaterThan(0);
    expect(report.caveats[0]).toContain("single-arm");
    // Completer detection used the injected cutoff, not wall-clock time.
    expect(CUTOFF.getTime()).toBeGreaterThan(new Date("2026-01-08T00:00:00.000Z").getTime());
  });

  it("suppresses the point estimate below min-N", async () => {
    await saveStudent("s1", 0.4, 0.1, new Date("2026-01-25T00:00:00.000Z"));
    await saveStudent("s2", 0.4, 0.1, new Date("2026-01-25T00:00:00.000Z"));
    const report = await service.cohortReport({
      cohortId: "cohort-a",
      from: FROM,
      to: TO,
      studentIds: ["s1", "s2"],
    });
    expect(report.grade).toBe("insufficient_n");
    expect(report.meanGapChange).toBeNull();
  });
});

describe("compareStaggeredCohorts", () => {
  async function seedTwoCohorts(): Promise<{
    treated: CohortWindow;
    control: CohortWindow;
  }> {
    for (const id of ["t1", "t2", "t3"]) {
      await saveStudent(id, 0.4, 0.1, new Date("2026-01-25T00:00:00.000Z"));
    }
    for (const id of ["c1", "c2", "c3"]) {
      await saveStudent(id, 0.4, 0.3, new Date("2026-01-25T00:00:00.000Z"));
    }
    return {
      treated: { cohortId: "treated", from: FROM, to: TO, studentIds: ["t1", "t2", "t3"] },
      control: { cohortId: "control", from: FROM, to: TO, studentIds: ["c1", "c2", "c3"] },
    };
  }

  it("earns 'quasi_experimental' when the control is not yet treated at clock time", async () => {
    const { treated, control } = await seedTwoCohorts();
    now = new Date("2026-03-01T00:00:00.000Z"); // control starts later
    const comparison = await service.compareStaggeredCohorts(
      { window: treated, assignment: { cohortId: "treated", startedAt: new Date("2026-01-01T00:00:00.000Z") } },
      { window: control, assignment: { cohortId: "control", startedAt: new Date("2026-06-01T00:00:00.000Z") } },
    );
    expect(comparison.grade).toBe("quasi_experimental");
    expect(comparison.valid).toBe(true);
    expect(comparison.difference).not.toBeNull();
  });

  it("refuses (associational) once the control has also started", async () => {
    const { treated, control } = await seedTwoCohorts();
    now = new Date("2026-07-01T00:00:00.000Z"); // both cohorts now treated
    const comparison = await service.compareStaggeredCohorts(
      { window: treated, assignment: { cohortId: "treated", startedAt: new Date("2026-01-01T00:00:00.000Z") } },
      { window: control, assignment: { cohortId: "control", startedAt: new Date("2026-06-01T00:00:00.000Z") } },
    );
    expect(comparison.grade).toBe("associational");
    expect(comparison.valid).toBe(false);
    expect(comparison.difference).toBeNull();
  });
});
