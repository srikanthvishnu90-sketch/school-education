import { beforeEach, describe, expect, it, vi } from "vitest";
import type { World } from "@/app/_world/world";
import type { ClassInsightSummary } from "@/domain/intelligence/insight";

/**
 * Tiered visibility is an AUTHORIZATION invariant, not a UI convenience (brief A5).
 * This is the negative-test matrix: for every protected capability, the WRONG roles
 * are refused server-side and the RIGHT role is allowed through to the data layer.
 *
 * The proof that the gate lives in the action (not the component) is structural: for
 * a refused caller the data source (getWorld / getSafetyWorld) is NEVER reached, so
 * no student data is even queried before the role is rejected. For the allowed caller
 * the action passes the gate and hits the data source — which we stub to reject with a
 * SENTINEL, so "reached the data layer" is observable as that specific rejection.
 *
 * Role tiers (CLAUDE.md):
 *   student   — only their own data.
 *   teacher   — task-focused summaries + AGGREGATE counts; never raw student text.
 *   counselor — ONLY the safety-alert queue.
 *   admin     — usage counts + aggregate trends only.
 */

const SENTINEL = "__reached_data_layer__";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getWorld: vi.fn(),
  getSafetyWorld: vi.fn(),
  recordAudit: vi.fn(),
  listAudit: vi.fn(() => []),
  screenReflectionText: vi.fn(),
  hasReflectionConsent: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
  // Faithful mirror of the real getSessionStudent: the id iff the caller is a
  // student, else null. reflectionActions + timelineActions gate on this.
  getSessionStudent: async () => {
    const u = await mocks.getSessionUser();
    return u !== null && u.role === "student" ? u.id : null;
  },
}));

vi.mock("@/app/_world/world", () => ({ getWorld: mocks.getWorld }));
vi.mock("@/app/_world/safetyWorld", () => ({ getSafetyWorld: mocks.getSafetyWorld }));
vi.mock("@/app/_world/auditLog", () => ({
  recordAudit: mocks.recordAudit,
  listAudit: mocks.listAudit,
}));
vi.mock("@/app/_world/safetyActions", () => ({
  screenReflectionText: mocks.screenReflectionText,
}));
vi.mock("@/app/_world/consentActions", () => ({
  hasReflectionConsent: mocks.hasReflectionConsent,
}));

import {
  approveReflectionQuestions,
  buildClassBrief,
  createLessonReflection,
  listScoreRows,
} from "@/app/_world/teacherReflectionActions";
import { acknowledgeEscalation, listEscalations } from "@/app/_world/counselorActions";
import { listStudentReflections } from "@/app/_world/studentReflectionActions";
import { startReflection } from "@/app/_world/reflectionActions";
import { getAdminOverview } from "@/app/_world/adminActions";

type Role = "student" | "teacher" | "counselor" | "admin";
type SessionUser = { id: string; role: Role; tenantId: string } | null;

const USERS: Record<string, SessionUser> = {
  student: { id: "student-1", role: "student", tenantId: "t1" },
  teacher: { id: "teacher-1", role: "teacher", tenantId: "t1" },
  counselor: { id: "counselor-1", role: "counselor", tenantId: "t1" },
  admin: { id: "admin-1", role: "admin", tenantId: "t1" },
  unauthenticated: null,
};
const ALL_ROLE_KEYS = Object.keys(USERS);

beforeEach(() => {
  vi.clearAllMocks();
  // By default the data layer is unreachable-with-a-signature: any caller that gets
  // past its role gate lands here, and we can see it happen.
  mocks.getWorld.mockRejectedValue(new Error(SENTINEL));
  mocks.getSafetyWorld.mockRejectedValue(new Error(SENTINEL));
});

function signInAs(roleKey: string): void {
  mocks.getSessionUser.mockResolvedValue(USERS[roleKey]);
}

/**
 * Capabilities whose refusal is a THROWN error (teacher / student / admin surfaces).
 * `allow` is the single role permitted; every other role must be refused with
 * `message`, and getWorld must not be reached for the refused caller.
 */
const throwCaps: ReadonlyArray<{
  cap: string;
  allow: string;
  message: string;
  invoke: () => Promise<unknown>;
}> = [
  {
    cap: "teacher.createLessonReflection",
    allow: "teacher",
    message: "Only a teacher can do this.",
    invoke: () =>
      createLessonReflection({
        title: "Fractions",
        lessonType: "independent_practice",
        content: "We practiced equivalent fractions.",
      }),
  },
  {
    cap: "teacher.buildClassBrief",
    allow: "teacher",
    message: "Only a teacher can do this.",
    invoke: () => buildClassBrief("lesson-1"),
  },
  {
    cap: "teacher.listScoreRows",
    allow: "teacher",
    message: "Only a teacher can do this.",
    invoke: () => listScoreRows("lesson-1"),
  },
  {
    cap: "teacher.approveReflectionQuestions",
    allow: "teacher",
    message: "Only a teacher can do this.",
    invoke: () => approveReflectionQuestions("lesson-1"),
  },
  {
    cap: "student.listStudentReflections",
    allow: "student",
    message: "Only a student can view these reflections.",
    invoke: () => listStudentReflections(),
  },
  {
    cap: "student.startReflection",
    allow: "student",
    message: "Student authentication required.",
    invoke: () => startReflection("lesson-1"),
  },
  {
    cap: "admin.getAdminOverview",
    allow: "admin",
    message: "Only a district admin can view this.",
    invoke: () => getAdminOverview(),
  },
];

describe("authorization matrix — thrown-refusal capabilities (role × capability)", () => {
  for (const { cap, allow, message, invoke } of throwCaps) {
    const deniedRoles = ALL_ROLE_KEYS.filter((r) => r !== allow);

    it.each(deniedRoles)(`${cap}: REFUSES %s before any data access`, async (roleKey) => {
      signInAs(roleKey);
      await expect(invoke()).rejects.toThrow(message);
      // The gate is upstream of the data layer: a refused caller never queries data.
      expect(mocks.getWorld).not.toHaveBeenCalled();
    });

    it(`${cap}: ALLOWS ${allow} through to the data layer`, async () => {
      signInAs(allow);
      // Passing the role gate lands in getWorld (our SENTINEL) — not the refusal error.
      await expect(invoke()).rejects.toThrow(SENTINEL);
      expect(mocks.getWorld).toHaveBeenCalled();
    });
  }
});

/**
 * Counselor capabilities do not throw on refusal; they return an EMPTY / negative
 * result. Same invariant: a non-counselor never reaches the safety world (the crisis
 * queue), and the counselor does.
 */
describe("authorization matrix — counselor-only safety queue", () => {
  const deniedRoles = ALL_ROLE_KEYS.filter((r) => r !== "counselor");

  it.each(deniedRoles)(
    "counselor.listEscalations: returns [] for %s and never opens the safety world",
    async (roleKey) => {
      signInAs(roleKey);
      await expect(listEscalations()).resolves.toEqual([]);
      expect(mocks.getSafetyWorld).not.toHaveBeenCalled();
    },
  );

  it("counselor.listEscalations: ALLOWS counselor through to the safety world", async () => {
    signInAs("counselor");
    await expect(listEscalations()).rejects.toThrow(SENTINEL);
    expect(mocks.getSafetyWorld).toHaveBeenCalled();
  });

  it.each(deniedRoles)(
    "counselor.acknowledgeEscalation: returns { ok: false } for %s and never opens the safety world",
    async (roleKey) => {
      signInAs(roleKey);
      await expect(acknowledgeEscalation("esc-1")).resolves.toEqual({ ok: false });
      expect(mocks.getSafetyWorld).not.toHaveBeenCalled();
    },
  );

  it("counselor.acknowledgeEscalation: ALLOWS counselor through to the safety world", async () => {
    signInAs("counselor");
    await expect(acknowledgeEscalation("esc-1")).rejects.toThrow(SENTINEL);
    expect(mocks.getSafetyWorld).toHaveBeenCalled();
  });
});

/**
 * The core content-leak invariant: even for the ALLOWED teacher, buildClassBrief must
 * return AGGREGATE counts only — never a per-student payload and never the raw/emotional
 * reflection text the aggregation factory read on the way. This is the one that would
 * matter if a future change tried to hand the teacher richer per-student data.
 */
describe("teacher.buildClassBrief returns aggregate counts, never raw student text", () => {
  const REFLECTION_ID = "lesson-1";
  const NOW = new Date("2026-07-20T12:00:00.000Z");
  const TEACHER = USERS.teacher as { id: string; role: Role; tenantId: string };

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

  function stubWorld(): World {
    const sessions = [
      {
        id: `${REFLECTION_ID}:student-a`,
        reflectionId: REFLECTION_ID,
        studentId: "student-a",
        status: "completed" as const,
        messages: [
          { sender: "ai", category: "metacognitive", text: "How sure are you?" },
          { sender: "student", text: "Very confident" },
        ],
      },
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
        lessons: {
          findById: vi.fn(async () => ({
            id: REFLECTION_ID,
            teacherId: TEACHER.id,
            tenantId: TEACHER.tenantId,
            title: "Fractions",
          })),
        },
        sessions: { listByReflection: vi.fn(async () => sessions) },
        studentSummaries: {
          findByReflectionAndStudent: vi.fn(async (_r: string, studentId: string) => ({
            id: `sum-${studentId}`,
            studentId,
            reflectionId: REFLECTION_ID,
            // The private, self-focused text the factory reads — it must NOT surface.
            emotionalSummary: `RAW PRIVATE FEELING TEXT for ${studentId}`,
          })),
        },
        performances: {
          findByReflectionAndStudent: vi.fn(async (_r: string, studentId: string) => ({
            reflectionId: REFLECTION_ID,
            studentId,
            score: 0.4,
            recordedAt: NOW,
          })),
        },
        classSummaries: { save: vi.fn(async () => undefined) },
      },
    } as unknown as World;
  }

  beforeEach(() => {
    signInAs("teacher");
    mocks.getWorld.mockResolvedValue(stubWorld());
  });

  it("exposes only { brief, calibration, completedCount, startedCount, studentCount }", async () => {
    const view = await buildClassBrief(REFLECTION_ID);
    expect(view).not.toBeNull();
    if (view === null) return;

    expect(Object.keys(view).sort()).toEqual(
      ["brief", "calibration", "completedCount", "startedCount", "studentCount"].sort(),
    );
    // studentCount is a COUNT, not a roster of per-student payloads.
    expect(view.studentCount).toBe(1);
    // The raw per-student feeling text the aggregation read must not leak anywhere.
    expect(JSON.stringify(view)).not.toContain("RAW PRIVATE FEELING TEXT");
  });
});
