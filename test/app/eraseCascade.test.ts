import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorldCore } from "@/application";
import { buildIntelRepos, type IntelRepos } from "@/app/_world/intelligence";
import {
  createCalibrationRecord,
  createEvidence,
} from "@/domain/intelligence/calibrationModel";

/**
 * B4 — the right-to-erasure cascade now reaches the skill-tag calibration model
 * (brief §2). Erasing a student's reflection record hard-deletes their Evidence and
 * CalibrationRecords along with their sessions/summaries/scores, and a SECOND
 * student's calibration data is left completely untouched. Proven against real
 * in-memory repositories + a real ConsentService, so "gone" is observed through the
 * actual store, not a stub.
 */

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getWorld: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/app/_world/world", () => ({ getWorld: mocks.getWorld }));

import { eraseMyReflectionData } from "@/app/_world/dataRightsActions";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const TENANT = "district-demo";
const STUDENT = "student-erase";
const OTHER = "student-keep";
const LESSON_ID = "lesson-cal";

/** Seed one Evidence + one CalibrationRecord for a student, on a given skill. */
async function seedCalibration(
  intel: IntelRepos,
  studentId: string,
  skillId: string,
): Promise<void> {
  await intel.evidence.save(
    createEvidence({
      id: `ev-${studentId}-${skillId}`,
      studentId,
      lessonId: LESSON_ID,
      skillId,
      kind: "score",
      value: 60,
      maxValue: 100,
    }),
  );
  await intel.calibrationRecords.save(
    createCalibrationRecord({
      id: `cal-${studentId}-${skillId}`,
      studentId,
      skillId,
      lessonId: LESSON_ID,
      claimedConfidence: 1,
      demonstrated: 0.6,
      delta: 0.4,
      computedAt: NOW,
    }),
  );
}

let intel: IntelRepos;

beforeEach(async () => {
  vi.clearAllMocks();
  intel = await buildIntelRepos(null);
  const core = buildWorldCore();
  const world = {
    intel,
    consentService: core.consentService,
    clock: { now: () => NOW },
  };
  mocks.getWorld.mockResolvedValue(
    world as unknown as Awaited<ReturnType<typeof mocks.getWorld>>,
  );
  mocks.getSessionUser.mockResolvedValue({
    id: STUDENT,
    role: "student",
    tenantId: TENANT,
  });
});

describe("eraseMyReflectionData — the cascade reaches calibration data (B4)", () => {
  it("hard-deletes the student's evidence + calibration records and reports the counts", async () => {
    // The erasing student has calibration data on two skills.
    await seedCalibration(intel, STUDENT, "skill-1");
    await seedCalibration(intel, STUDENT, "skill-2");
    // A different student has their own — it must survive.
    await seedCalibration(intel, OTHER, "skill-1");

    const result = await eraseMyReflectionData();

    expect(result.ok).toBe(true);
    expect(result.deleted.evidence).toBe(2);
    expect(result.deleted.calibrationRecords).toBe(2);

    // The student's data is gone from the real store…
    expect(await intel.evidence.listByStudent(STUDENT)).toEqual([]);
    expect(await intel.calibrationRecords.listByStudent(STUDENT)).toEqual([]);

    // …and the second student's data is completely untouched.
    expect(await intel.evidence.listByStudent(OTHER)).toHaveLength(1);
    expect(await intel.calibrationRecords.listByStudent(OTHER)).toHaveLength(1);
  });

  it("reports zero calibration counts when the student had none, and still succeeds", async () => {
    await seedCalibration(intel, OTHER, "skill-1");

    const result = await eraseMyReflectionData();

    expect(result.ok).toBe(true);
    expect(result.deleted.evidence).toBe(0);
    expect(result.deleted.calibrationRecords).toBe(0);
    // The other student is untouched.
    expect(await intel.evidence.listByStudent(OTHER)).toHaveLength(1);
    expect(await intel.calibrationRecords.listByStudent(OTHER)).toHaveLength(1);
  });
});
