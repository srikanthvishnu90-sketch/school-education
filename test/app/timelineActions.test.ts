import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionStudent: vi.fn(),
  getWorld: vi.fn(),
  listSessionsByStudent: vi.fn(),
  findLessonById: vi.fn(),
  findPerformance: vi.fn(),
  listCalibrationByStudent: vi.fn(),
  findSkillTagById: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionStudent: mocks.getSessionStudent,
}));

vi.mock("@/app/_world/world", () => ({
  getWorld: mocks.getWorld,
}));

import { getStudentTimeline } from "@/app/_world/timelineActions";

/** A completed session; a "very confident" answer reads as 1.0 self-confidence. */
function session(input: {
  reflectionId: string;
  completedAt: string;
  selectedAction?: string;
  confidence?: string;
}): unknown {
  const messages =
    input.confidence === undefined
      ? []
      : [
          {
            id: "ai-1",
            sessionId: "s",
            sender: "ai",
            text: "How sure are you?",
            category: "metacognitive",
            createdAt: new Date(input.completedAt),
          },
          {
            id: "st-1",
            sessionId: "s",
            sender: "student",
            text: input.confidence,
            createdAt: new Date(input.completedAt),
          },
        ];
  return {
    id: `session-${input.reflectionId}`,
    reflectionId: input.reflectionId,
    studentId: "student-avery",
    status: "completed",
    messages,
    selectedAction: input.selectedAction,
    startedAt: new Date(input.completedAt),
    completedAt: new Date(input.completedAt),
  };
}

describe("student timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionStudent.mockResolvedValue("student-avery");
    mocks.getWorld.mockResolvedValue({
      intel: {
        sessions: { listByStudent: mocks.listSessionsByStudent },
        lessons: { findById: mocks.findLessonById },
        performances: { findByReflectionAndStudent: mocks.findPerformance },
        calibrationRecords: { listByStudent: mocks.listCalibrationByStudent },
        skillTags: { findById: mocks.findSkillTagById },
      },
    });
    mocks.findLessonById.mockImplementation(async (id: string) => ({
      id,
      title: `Lesson ${id}`,
    }));
    // Default: no skill calibration records (each test opts in as needed).
    mocks.listCalibrationByStudent.mockResolvedValue([]);
    mocks.findSkillTagById.mockResolvedValue(null);
  });

  it("shows a completed-but-ungraded reflection with its chosen next step and no score", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([
      session({
        reflectionId: "lesson-a",
        completedAt: "2026-07-10T15:00:00.000Z",
        selectedAction: "Re-do problem 3 without notes.",
        confidence: "very confident",
      }),
    ]);
    mocks.findPerformance.mockResolvedValue(null);

    const { entries, trend } = await getStudentTimeline();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      reflectionId: "lesson-a",
      title: "Lesson lesson-a",
      selectedAction: "Re-do problem 3 without notes.",
      scorePercent: null,
      selfConfidencePercent: null,
      alignment: null,
    });
    // No graded outcome yet → no trend to assert.
    expect(trend).toBe("insufficient");
  });

  it("shows the calibration once a graded result exists", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([
      session({
        reflectionId: "lesson-b",
        completedAt: "2026-07-11T15:00:00.000Z",
        selectedAction: "Ask about slope in class.",
        confidence: "very confident",
      }),
    ]);
    mocks.findPerformance.mockImplementation(async () => ({
      reflectionId: "lesson-b",
      studentId: "student-avery",
      score: 0.5,
      recordedAt: new Date("2026-07-12T15:00:00.000Z"),
    }));

    const { entries } = await getStudentTimeline();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      reflectionId: "lesson-b",
      selectedAction: "Ask about slope in class.",
      scorePercent: 50,
      selfConfidencePercent: 100,
      // Felt "very confident" (1.0) but scored 0.5 → confidence ran ahead.
      alignment: "confidence_ahead_of_result",
    });
  });

  it("surfaces per-skill calibration, resolving each skill's tag label", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([
      session({ reflectionId: "lesson-b", completedAt: "2026-07-11T15:00:00.000Z" }),
    ]);
    mocks.findPerformance.mockResolvedValue(null);
    mocks.listCalibrationByStudent.mockResolvedValue([
      {
        id: "cal-1",
        studentId: "student-avery",
        skillId: "skill-class-1-adding-fractions",
        lessonId: "lesson-b",
        claimedConfidence: 0.9,
        demonstrated: 0.5,
        delta: 0.4,
        computedAt: new Date("2026-07-12T15:00:00.000Z"),
      },
    ]);
    mocks.findSkillTagById.mockResolvedValue({
      id: "skill-class-1-adding-fractions",
      classId: "class-1",
      label: "Adding fractions",
      source: "ai_extracted",
    });

    const { skills } = await getStudentTimeline();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      label: "Adding fractions",
      latestDelta: 0.4,
      direction: "insufficient",
      count: 1,
    });
  });

  it("falls back to a readable id tail when a skill tag is missing", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([
      session({ reflectionId: "lesson-b", completedAt: "2026-07-11T15:00:00.000Z" }),
    ]);
    mocks.findPerformance.mockResolvedValue(null);
    mocks.listCalibrationByStudent.mockResolvedValue([
      {
        id: "cal-1",
        studentId: "student-avery",
        skillId: "skill-comparing-decimals",
        lessonId: "lesson-b",
        claimedConfidence: 0.9,
        demonstrated: null,
        delta: null,
        computedAt: new Date("2026-07-12T15:00:00.000Z"),
      },
    ]);
    mocks.findSkillTagById.mockResolvedValue(null);

    const { skills } = await getStudentTimeline();

    expect(skills[0].label).toBe("comparing decimals");
    expect(skills[0].latestDelta).toBeNull();
  });

  it("orders entries newest-first by completion time", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([
      session({
        reflectionId: "lesson-old",
        completedAt: "2026-07-09T15:00:00.000Z",
      }),
      session({
        reflectionId: "lesson-new",
        completedAt: "2026-07-12T15:00:00.000Z",
      }),
    ]);
    mocks.findPerformance.mockResolvedValue(null);

    const { entries } = await getStudentTimeline();

    expect(entries.map((e) => e.reflectionId)).toEqual([
      "lesson-new",
      "lesson-old",
    ]);
  });

  it("ignores sessions that are not completed", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([
      { ...(session({ reflectionId: "lesson-active", completedAt: "2026-07-10T15:00:00.000Z" }) as object), status: "active" },
      session({ reflectionId: "lesson-done", completedAt: "2026-07-11T15:00:00.000Z" }),
    ]);
    mocks.findPerformance.mockResolvedValue(null);

    const { entries } = await getStudentTimeline();

    expect(entries.map((e) => e.reflectionId)).toEqual(["lesson-done"]);
  });
});
