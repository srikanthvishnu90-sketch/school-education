import { describe, expect, it } from "vitest";

import { buildIntelRepos, type IntelRepos } from "@/app/_world/intelligence";
import { syncSkillCalibration } from "@/app/_world/calibrationSync";
import { createLesson } from "@/domain/intelligence/lesson";
import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import { ALIGNMENT_EPS } from "@/domain/intelligence/metacognition";

/**
 * The skill-tag calibration glue (brief §2): scoring a reflection fans the one score
 * and the one in-chat self-confidence across every skill the lesson tags, producing
 * per-skill Evidence + CalibrationRecords — server-side, invisible to the student.
 */

const NOW = new Date("2026-07-20T12:00:00.000Z");
const CLASS_ID = "class-cal";
const TENANT = "district-demo";

function makeWorld(intel: IntelRepos) {
  return { intel, clock: { now: () => NOW } };
}

/** A lesson with the given objectives (or a title-only lesson when none). */
async function seedLesson(
  intel: IntelRepos,
  reflectionId: string,
  objectives: string[],
  title = "Factoring quadratics",
): Promise<void> {
  await intel.lessons.save(
    createLesson({
      id: reflectionId,
      tenantId: TENANT,
      classId: CLASS_ID,
      teacherId: "teacher-1",
      title,
      date: NOW,
      lessonType: "independent_practice",
      content: "…",
      objectives,
      standards: [],
      createdAt: NOW,
    }),
  );
}

/** A completed session whose single metacognitive answer maps to a known scale value. */
function completedSession(
  reflectionId: string,
  studentId: string,
  confidenceAnswer: string,
): ReflectionSession {
  const sessionId = `${reflectionId}:${studentId}`;
  return createReflectionSession({
    id: sessionId,
    reflectionId,
    studentId,
    status: "completed",
    startedAt: NOW,
    completedAt: NOW,
    messages: [
      createReflectionMessage({
        id: `${sessionId}-ai`,
        sessionId,
        sender: "ai",
        text: "How sure are you?",
        category: "metacognitive",
        createdAt: NOW,
      }),
      createReflectionMessage({
        id: `${sessionId}-stu`,
        sessionId,
        sender: "student",
        text: confidenceAnswer,
        createdAt: NOW,
      }),
    ],
  });
}

describe("syncSkillCalibration", () => {
  it("creates one Evidence + CalibrationRecord per lesson objective", async () => {
    const intel = await buildIntelRepos(null);
    const reflectionId = "lesson-obj";
    await seedLesson(intel, reflectionId, ["factor a trinomial", "check the sign"]);
    // Very confident (1.0) but a 60% score → confidence ran ahead: delta > 0.
    const session = completedSession(reflectionId, "student-a", "Very confident");

    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-a",
      classId: CLASS_ID,
      scorePercent: 60,
      session,
    });

    const tags = await intel.skillTags.listByClass(CLASS_ID);
    expect(tags.map((t) => t.label).sort()).toEqual([
      "check the sign",
      "factor a trinomial",
    ]);
    expect(tags.every((t) => t.source === "ai_extracted")).toBe(true);

    const evidence = await intel.evidence.listByStudentAndLesson(
      "student-a",
      reflectionId,
    );
    expect(evidence).toHaveLength(2);
    expect(evidence.every((e) => e.kind === "score" && e.value === 60 && e.maxValue === 100)).toBe(
      true,
    );

    const records = await intel.calibrationRecords.listByStudent("student-a");
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.claimedConfidence).toBe(1);
      expect(r.demonstrated).toBe(0.6);
      expect(r.delta).toBeGreaterThan(0); // confidence ahead of result
    }
  });

  it("falls back to the lesson title as the single skill when there are no objectives", async () => {
    const intel = await buildIntelRepos(null);
    const reflectionId = "lesson-title";
    await seedLesson(intel, reflectionId, [], "Slope of a line");
    // A little (0.25) confidence against an 85% score → result ran ahead: delta < 0.
    const session = completedSession(reflectionId, "student-b", "A little");

    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-b",
      classId: CLASS_ID,
      scorePercent: 85,
      session,
    });

    const tags = await intel.skillTags.listByClass(CLASS_ID);
    expect(tags.map((t) => t.label)).toEqual(["Slope of a line"]);

    const records = await intel.calibrationRecords.listByStudent("student-b");
    expect(records).toHaveLength(1);
    expect(records[0].delta).toBeLessThan(0); // result ahead of confidence
  });

  it("reuses skill tags across a second student rather than duplicating them", async () => {
    const intel = await buildIntelRepos(null);
    const reflectionId = "lesson-shared";
    await seedLesson(intel, reflectionId, ["factor a trinomial", "check the sign"]);

    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-a",
      classId: CLASS_ID,
      scorePercent: 60,
      session: completedSession(reflectionId, "student-a", "Very confident"),
    });
    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-b",
      classId: CLASS_ID,
      scorePercent: 90,
      session: completedSession(reflectionId, "student-b", "Somewhat"),
    });

    // Same two tags — the second student did NOT mint new ones.
    expect(await intel.skillTags.listByClass(CLASS_ID)).toHaveLength(2);
    expect(await intel.calibrationRecords.listByStudent("student-a")).toHaveLength(2);
    expect(await intel.calibrationRecords.listByStudent("student-b")).toHaveLength(2);
  });

  it("is idempotent: re-scoring overwrites by id instead of duplicating", async () => {
    const intel = await buildIntelRepos(null);
    const reflectionId = "lesson-rescore";
    await seedLesson(intel, reflectionId, ["factor a trinomial", "check the sign"]);
    const session = completedSession(reflectionId, "student-a", "Very confident");

    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-a",
      classId: CLASS_ID,
      scorePercent: 60,
      session,
    });
    // Re-score the SAME reflection with a corrected grade.
    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-a",
      classId: CLASS_ID,
      scorePercent: 95,
      session,
    });

    const records = await intel.calibrationRecords.listByStudent("student-a");
    expect(records).toHaveLength(2); // still one per skill, not four
    for (const r of records) {
      expect(r.demonstrated).toBe(0.95); // overwritten to the new grade
      expect(r.delta).toBeCloseTo(1 - 0.95, 10); // confidence 1.0 − 0.95
    }
    const evidence = await intel.evidence.listByStudentAndLesson(
      "student-a",
      reflectionId,
    );
    expect(evidence).toHaveLength(2);
    expect(evidence.every((e) => e.value === 95)).toBe(true);
  });

  it("no-ops safely when the session or the lesson is missing", async () => {
    const intel = await buildIntelRepos(null);
    const reflectionId = "lesson-present";
    await seedLesson(intel, reflectionId, ["factor a trinomial"]);

    // No session → nothing written.
    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-a",
      classId: CLASS_ID,
      scorePercent: 60,
      session: null,
    });
    expect(await intel.skillTags.listByClass(CLASS_ID)).toHaveLength(0);
    expect(await intel.calibrationRecords.listByStudent("student-a")).toHaveLength(0);

    // No lesson (unknown reflectionId) → nothing written.
    await syncSkillCalibration(makeWorld(intel), {
      reflectionId: "lesson-missing",
      studentId: "student-a",
      classId: CLASS_ID,
      scorePercent: 60,
      session: completedSession("lesson-missing", "student-a", "Very confident"),
    });
    expect(await intel.skillTags.listByClass(CLASS_ID)).toHaveLength(0);
    expect(await intel.calibrationRecords.listByStudent("student-a")).toHaveLength(0);
  });

  it("writes Evidence but no CalibrationRecord when confidence is unreadable", async () => {
    const intel = await buildIntelRepos(null);
    const reflectionId = "lesson-noconf";
    await seedLesson(intel, reflectionId, ["factor a trinomial"]);
    // An answer that matches no scale label → readSelfConfidence is null.
    const session = completedSession(reflectionId, "student-a", "no idea");

    await syncSkillCalibration(makeWorld(intel), {
      reflectionId,
      studentId: "student-a",
      classId: CLASS_ID,
      scorePercent: 60,
      session,
    });

    expect(
      await intel.evidence.listByStudentAndLesson("student-a", reflectionId),
    ).toHaveLength(1);
    expect(await intel.calibrationRecords.listByStudent("student-a")).toHaveLength(0);
  });
});

// A guard so ALIGNMENT_EPS stays the tolerance the seed's "aligned" archetype relies on.
describe("alignment tolerance", () => {
  it("treats Casey's small gap as within the aligned band", () => {
    expect(Math.abs(0.75 - 0.7)).toBeLessThanOrEqual(ALIGNMENT_EPS);
  });
});
