import { beforeEach, describe, expect, it, vi } from "vitest";
import type { World } from "@/app/_world/world";
import type { ClassInsightSummary } from "@/domain/intelligence/insight";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getWorld: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/app/_world/world", () => ({
  getWorld: mocks.getWorld,
}));

vi.mock("@/app/_world/auditLog", () => ({
  recordAudit: mocks.recordAudit,
}));

import {
  buildClassBrief,
  getLessonSkillCalibration,
} from "@/app/_world/teacherReflectionActions";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const REFLECTION_ID = "lesson-1";
const TEACHER = { id: "teacher-1", role: "teacher", tenantId: "t1" };

const LESSON = {
  id: REFLECTION_ID,
  teacherId: TEACHER.id,
  tenantId: TEACHER.tenantId,
  title: "Fractions",
};

/** A completed session whose one metacognitive answer maps to a known scale value. */
function completedSession(studentId: string, confidenceAnswer: string) {
  return {
    id: `${REFLECTION_ID}:${studentId}`,
    reflectionId: REFLECTION_ID,
    studentId,
    status: "completed" as const,
    messages: [
      { sender: "ai", category: "metacognitive", text: "How sure are you?" },
      { sender: "student", text: confidenceAnswer },
    ],
  };
}

const BRIEF: ClassInsightSummary = {
  id: "brief-1",
  classId: "class-1",
  reflectionId: REFLECTION_ID,
  technicalSummary: "The class handled equivalent fractions.",
  emotionalSummary: "A steady, workmanlike session.",
  behavioralSummary: "Most students checked their own work.",
  keyRelationship: "Checking work went with steadier confidence.",
  recommendedPlan: ["Revisit common denominators with a warm-up."],
  attentionStudents: [],
  createdAt: NOW,
};

function makeWorld(options: {
  sessions: ReturnType<typeof completedSession>[];
  activeStudentIds?: string[];
  gradedScores: Record<string, number>;
}): World {
  const sessions = [
    ...options.sessions,
    ...(options.activeStudentIds ?? []).map((studentId) => ({
      id: `${REFLECTION_ID}:${studentId}`,
      reflectionId: REFLECTION_ID,
      studentId,
      status: "active" as const,
      messages: [],
    })),
  ];
  return {
    clock: { now: () => NOW },
    intelligence: {
      extractSignals: vi.fn(async () => ({
        technical: [],
        emotional: [],
        behavioral: [],
        context: [],
      })),
      summarizeClassReflection: vi.fn(async () => BRIEF),
    },
    intel: {
      lessons: { findById: vi.fn(async () => LESSON) },
      sessions: { listByReflection: vi.fn(async () => sessions) },
      studentSummaries: {
        findByReflectionAndStudent: vi.fn(async (_r: string, studentId: string) => ({
          id: `sum-${studentId}`,
          studentId,
          reflectionId: REFLECTION_ID,
          emotionalSummary: `private feeling text for ${studentId}`,
        })),
      },
      performances: {
        findByReflectionAndStudent: vi.fn(async (_r: string, studentId: string) => {
          const score = options.gradedScores[studentId];
          return score === undefined
            ? null
            : { reflectionId: REFLECTION_ID, studentId, score, recordedAt: NOW };
        }),
      },
      classSummaries: { save: vi.fn(async () => undefined) },
    },
  } as unknown as World;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue(TEACHER);
});

describe("buildClassBrief — completion figures + aggregate calibration", () => {
  it("reports completed/started counts and calibration bucket counts", async () => {
    mocks.getWorld.mockResolvedValue(
      makeWorld({
        sessions: [
          completedSession("student-a", "Very confident"), // 1.0 vs 0.4 → confidence ahead
          completedSession("student-b", "Not yet"), // 0.0 vs 0.9 → result ahead
          completedSession("student-c", "Somewhat"), // 0.5 vs 0.5 → aligned
          completedSession("student-d", "Confident"), // graded absent → not comparable
        ],
        activeStudentIds: ["student-e"], // started but not finished
        gradedScores: {
          "student-a": 0.4,
          "student-b": 0.9,
          "student-c": 0.5,
        },
      }),
    );

    const view = await buildClassBrief(REFLECTION_ID);
    expect(view).not.toBeNull();
    if (view === null) return;

    expect(view.startedCount).toBe(5); // a,b,c,d completed + e active
    expect(view.completedCount).toBe(4); // a,b,c,d
    expect(view.studentCount).toBe(4);
    expect(view.calibration).toEqual({
      gradedCount: 3, // a,b,c (d has no score)
      comparableCount: 3,
      alignedCount: 1, // c
      confidenceAheadCount: 1, // a
      resultAheadCount: 1, // b
    });
  });

  it("returns a zeroed calibration (the grade-the-work case) when nothing is scored", async () => {
    mocks.getWorld.mockResolvedValue(
      makeWorld({
        sessions: [completedSession("student-a", "Somewhat")],
        gradedScores: {},
      }),
    );

    const view = await buildClassBrief(REFLECTION_ID);
    expect(view?.calibration).toEqual({
      gradedCount: 0,
      comparableCount: 0,
      alignedCount: 0,
      confidenceAheadCount: 0,
      resultAheadCount: 0,
    });
    expect(view?.completedCount).toBe(1);
    expect(view?.startedCount).toBe(1);
  });

  it("counts a graded student without a readable confidence as graded but not comparable", async () => {
    mocks.getWorld.mockResolvedValue(
      makeWorld({
        sessions: [completedSession("student-a", "no idea")], // unknown scale label
        gradedScores: { "student-a": 0.7 },
      }),
    );

    const view = await buildClassBrief(REFLECTION_ID);
    expect(view?.calibration.gradedCount).toBe(1);
    expect(view?.calibration.comparableCount).toBe(0);
  });

  it("preserves the aggregate-only privacy rule: the view exposes only counts, no per-student payload", async () => {
    mocks.getWorld.mockResolvedValue(
      makeWorld({
        sessions: [completedSession("student-a", "Very confident")],
        gradedScores: { "student-a": 0.4 },
      }),
    );

    const view = await buildClassBrief(REFLECTION_ID);
    expect(view).not.toBeNull();
    if (view === null) return;

    // Only the brief + aggregate counts are returned — no per-student summaries array.
    expect(Object.keys(view).sort()).toEqual(
      ["brief", "calibration", "completedCount", "startedCount", "studentCount"].sort(),
    );
    // The per-student emotional text the factory read must not leak anywhere in the view.
    expect(JSON.stringify(view)).not.toContain("private feeling text");
  });
});

/** A world for getLessonSkillCalibration: the lesson, its completed sessions, and each
 *  student's calibration records + skill tags. `lessonTeacherId` toggles ownership. */
function makeCalibrationWorld(options: {
  lessonTeacherId?: string;
  sessions: ReturnType<typeof completedSession>[];
  recordsByStudent: Record<
    string,
    { skillId: string; lessonId: string; claimedConfidence: number; demonstrated: number; delta: number; computedAt: Date }[]
  >;
}): World {
  return {
    clock: { now: () => NOW },
    intel: {
      lessons: {
        findById: vi.fn(async () => ({
          ...LESSON,
          teacherId: options.lessonTeacherId ?? LESSON.teacherId,
        })),
      },
      sessions: { listByReflection: vi.fn(async () => options.sessions) },
      calibrationRecords: {
        listByStudent: vi.fn(async (studentId: string) =>
          (options.recordsByStudent[studentId] ?? []).map((r) => ({
            id: `cal-${studentId}-${r.skillId}`,
            studentId,
            ...r,
          })),
        ),
      },
      skillTags: {
        findById: vi.fn(async (skillId: string) => ({
          id: skillId,
          classId: "class-1",
          label: `label for ${skillId}`,
          source: "ai_extracted",
        })),
      },
    },
  } as unknown as World;
}

describe("getLessonSkillCalibration — audits the staff calibration read (D3)", () => {
  it("records a view_class_brief per contributing student on an owned lesson", async () => {
    mocks.getWorld.mockResolvedValue(
      makeCalibrationWorld({
        sessions: [
          completedSession("student-a", "Very confident"),
          completedSession("student-b", "Somewhat"),
        ],
        recordsByStudent: {
          "student-a": [
            {
              skillId: "skill-1",
              lessonId: REFLECTION_ID,
              claimedConfidence: 1,
              demonstrated: 0.6,
              delta: 0.4,
              computedAt: NOW,
            },
          ],
          "student-b": [
            {
              skillId: "skill-1",
              lessonId: REFLECTION_ID,
              claimedConfidence: 0.5,
              demonstrated: 0.9,
              delta: -0.4,
              computedAt: NOW,
            },
          ],
        },
      }),
    );

    const view = await getLessonSkillCalibration(REFLECTION_ID);
    expect(view.length).toBeGreaterThan(0);

    const calls = mocks.recordAudit.mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.action === "view_class_brief")).toBe(true);
    expect(calls.every((c) => c.actorId === TEACHER.id && c.actorRole === "teacher")).toBe(
      true,
    );
    expect(calls.map((c) => c.studentId).sort()).toEqual(["student-a", "student-b"]);
  });

  it("records nothing and returns [] on a lesson the teacher does NOT own", async () => {
    mocks.getWorld.mockResolvedValue(
      makeCalibrationWorld({
        lessonTeacherId: "teacher-other",
        sessions: [completedSession("student-a", "Very confident")],
        recordsByStudent: {
          "student-a": [
            {
              skillId: "skill-1",
              lessonId: REFLECTION_ID,
              claimedConfidence: 1,
              demonstrated: 0.6,
              delta: 0.4,
              computedAt: NOW,
            },
          ],
        },
      }),
    );

    const view = await getLessonSkillCalibration(REFLECTION_ID);
    expect(view).toEqual([]);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
