import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionStudent: vi.fn(),
  getWorld: vi.fn(),
  listSessionsByStudent: vi.fn(),
  findLessonById: vi.fn(),
  findPerformance: vi.fn(),
  listCalibrationByStudent: vi.fn(),
  findSkillTagById: vi.fn(),
  listProbesByStudent: vi.fn(),
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
        probeAttempts: { listByStudent: mocks.listProbesByStudent },
      },
    });
    mocks.findLessonById.mockImplementation(async (id: string) => ({
      id,
      title: `Lesson ${id}`,
    }));
    // Default: no skill calibration records (each test opts in as needed).
    mocks.listCalibrationByStudent.mockResolvedValue([]);
    mocks.findSkillTagById.mockResolvedValue(null);
    // Default: no from-memory checks (each test opts in as needed).
    mocks.listProbesByStudent.mockResolvedValue([]);
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

  it("surfaces the student's own from-memory checks, newest-first with resolved titles", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([]);
    mocks.findPerformance.mockResolvedValue(null);
    mocks.listProbesByStudent.mockResolvedValue([
      probe({
        id: "probe-old",
        reflectionId: "lesson-a",
        selfScore: "partly",
        attemptedAt: "2026-07-10T15:00:00.000Z",
      }),
      probe({
        id: "probe-new",
        reflectionId: "lesson-b",
        selfScore: "got_it",
        attemptedAt: "2026-07-12T15:00:00.000Z",
      }),
    ]);

    const { probes, movement } = await getStudentTimeline();

    // Newest first.
    expect(probes.map((p) => p.reflectionId)).toEqual(["lesson-b", "lesson-a"]);
    // Lesson title resolved via the shared lookup.
    expect(probes[0]).toMatchObject({
      lessonTitle: "Lesson lesson-b",
      selfScore: "got_it",
      attemptedAt: "2026-07-12T15:00:00.000Z",
    });
    // partly (0.5) → got_it (1) over time reads as improving; latest is the newest.
    expect(movement).toMatchObject({
      got: 1,
      partly: 1,
      notYet: 0,
      latestSelfScore: "got_it",
      direction: "improving",
    });
  });

  it("degrades cleanly with no from-memory checks (empty probes, insufficient movement)", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([]);
    mocks.findPerformance.mockResolvedValue(null);
    // listProbesByStudent defaults to [].

    const { probes, movement } = await getStudentTimeline();

    expect(probes).toEqual([]);
    expect(movement).toMatchObject({
      got: 0,
      partly: 0,
      notYet: 0,
      latestSelfScore: null,
      direction: "insufficient",
    });
  });

  it("reads probes as STUDENT-PRIVATE data — never a teacher calibration path", async () => {
    mocks.listSessionsByStudent.mockResolvedValue([]);
    mocks.findPerformance.mockResolvedValue(null);
    mocks.listProbesByStudent.mockResolvedValue([
      probe({
        id: "probe-1",
        reflectionId: "lesson-a",
        selfScore: "got_it",
        attemptedAt: "2026-07-12T15:00:00.000Z",
      }),
    ]);

    const { probes, skills } = await getStudentTimeline();

    // The probe surfaced straight from the student's OWN probeAttempts, scoped to them…
    expect(probes).toHaveLength(1);
    expect(mocks.listProbesByStudent).toHaveBeenCalledWith("student-avery");
    // …with no teacher/graded calibration record required or emitted: the calibration
    // path is empty, yet the private probe still shows.
    expect(skills).toEqual([]);
    expect(mocks.listCalibrationByStudent).toHaveReturnedTimes(1);
  });
});

/** A self-scored from-memory check owned by the student. */
function probe(input: {
  id: string;
  reflectionId: string;
  selfScore: "got_it" | "partly" | "not_yet";
  attemptedAt: string;
}): unknown {
  return {
    id: input.id,
    reflectionId: input.reflectionId,
    studentId: "student-avery",
    response: "From memory, I worked it through.",
    selfScore: input.selfScore,
    attemptedAt: new Date(input.attemptedAt),
  };
}
