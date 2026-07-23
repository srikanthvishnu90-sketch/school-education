import { beforeEach, describe, expect, it, vi } from "vitest";
import type { World } from "@/app/_world/world";
import type { ReflectionSession } from "@/domain/intelligence/session";
import type { ProbeAttempt } from "@/domain/intelligence/probeAttempt";

/**
 * The tenant-scoped, admin-only EARLY PILOT SIGNALS (the no-teacher kill-test read).
 * The action is:
 *
 *   - ADMIN-ONLY: every other role is refused BEFORE any data is read.
 *   - AGGREGATE: only counts and rates leave — no student id, name, or reflection
 *     content appears in the result.
 *   - TENANT-SCOPED: only the admin's own district's lessons are read.
 */

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getWorld: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/app/_world/world", () => ({ getWorld: mocks.getWorld }));
vi.mock("@/app/_world/credentials", () => ({ tenantForId: vi.fn() }));
vi.mock("@/app/_world/auditLog", () => ({ listAudit: () => [] }));

import { getPilotSignals } from "@/app/_world/adminActions";

type Role = "student" | "teacher" | "counselor" | "admin";
const USERS: Record<string, { id: string; role: Role; tenantId: string } | null> = {
  student: { id: "student-1", role: "student", tenantId: "t1" },
  teacher: { id: "teacher-1", role: "teacher", tenantId: "t1" },
  counselor: { id: "counselor-1", role: "counselor", tenantId: "t1" },
  unauthenticated: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPilotSignals — admin-only", () => {
  it.each(Object.keys(USERS))(
    "REFUSES %s before any data is read",
    async (roleKey) => {
      mocks.getSessionUser.mockResolvedValue(USERS[roleKey]);
      await expect(getPilotSignals()).rejects.toThrow(
        "Only a district admin can view this.",
      );
      // The gate is upstream of the data layer.
      expect(mocks.getWorld).not.toHaveBeenCalled();
    },
  );
});

describe("getPilotSignals — aggregate, tenant-scoped snapshot for an admin", () => {
  const AT = (min: number): Date => new Date(2026, 6, 1, 0, min);

  const session = (
    id: string,
    studentId: string,
    status: ReflectionSession["status"],
  ): ReflectionSession =>
    ({
      id,
      reflectionId: "lesson-demo",
      studentId,
      status,
    }) as unknown as ReflectionSession;

  const probe = (
    studentId: string,
    selfScore: ProbeAttempt["selfScore"],
    at: Date,
  ): ProbeAttempt =>
    ({ studentId, selfScore, attemptedAt: at }) as unknown as ProbeAttempt;

  function stubWorld(over: {
    sessionsByReflection: Record<string, ReflectionSession[]>;
    probesByStudent: Record<string, ProbeAttempt[]>;
  }): World {
    return {
      intel: {
        lessons: {
          listByClass: vi.fn(async () => [
            { id: "lesson-demo", tenantId: "district-demo" },
            // A lesson in another district — must be filtered out by tenant.
            { id: "lesson-north", tenantId: "district-north" },
          ]),
        },
        sessions: {
          listByReflection: vi.fn(
            async (id: string) => over.sessionsByReflection[id] ?? [],
          ),
        },
        probeAttempts: {
          listByStudent: vi.fn(
            async (id: string) => over.probesByStudent[id] ?? [],
          ),
        },
      },
    } as unknown as World;
  }

  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      tenantId: "district-demo",
    });
  });

  it("computes aggregate return + probe signals from the tenant's data only", async () => {
    // Cohort of 3 students on the demo lesson. Avery completed twice (returned),
    // Blake completed once, Casey started but never completed.
    const world = stubWorld({
      sessionsByReflection: {
        "lesson-demo": [
          session("s1", "student-avery", "completed"),
          session("s2", "student-avery", "completed"),
          session("s3", "student-blake", "completed"),
          session("s4", "student-casey", "active"),
        ],
        // The north lesson would add a student if it were read — it must not be.
        "lesson-north": [session("s9", "student-north", "completed")],
      },
      probesByStudent: {
        // Avery's from-memory check improved over two attempts.
        "student-avery": [
          probe("student-avery", "not_yet", AT(0)),
          probe("student-avery", "got_it", AT(10)),
        ],
        // Blake tried one probe (not enough for movement).
        "student-blake": [probe("student-blake", "partly", AT(0))],
      },
    });
    mocks.getWorld.mockResolvedValue(world);

    const result = await getPilotSignals();

    // Only the demo lesson's sessions were read — the north lesson is out of tenant.
    expect(world.intel.sessions.listByReflection).toHaveBeenCalledWith("lesson-demo");
    expect(world.intel.sessions.listByReflection).not.toHaveBeenCalledWith(
      "lesson-north",
    );

    // 2 active (Avery, Blake); Casey never completed. Avery returned for #2.
    expect(result.activeStudents).toBe(2);
    expect(result.returnedForSecond).toBe(1);
    expect(result.returnRateSecond).toBeCloseTo(0.5, 10);
    expect(result.returnedForThird).toBe(0);
    expect(result.returnRateThird).toBeCloseTo(0, 10);

    // 2 of the 2 active students did ≥1 probe; one has an improving series.
    expect(result.probeCompletionCount).toBe(2);
    expect(result.probeCompletionRate).toBeCloseTo(1, 10);
    expect(result.studentsWithMultipleProbes).toBe(1);
    expect(result.improvingCount).toBe(1);
    expect(result.improvingShare).toBe(1);

    expect(result.tenantId).toBe("district-demo");
  });

  it("returns an aggregate shape with no per-student identifiers", async () => {
    mocks.getWorld.mockResolvedValue(
      stubWorld({
        sessionsByReflection: {
          "lesson-demo": [session("s1", "student-avery", "completed")],
        },
        probesByStudent: {},
      }),
    );

    const result = await getPilotSignals();
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(
      [
        "activeStudents",
        "improvingCount",
        "improvingShare",
        "note",
        "probeCompletionCount",
        "probeCompletionRate",
        "returnRateSecond",
        "returnRateThird",
        "returnedForSecond",
        "returnedForThird",
        "studentsWithMultipleProbes",
        "tenantId",
      ].sort(),
    );
    // No field carries a student id, name, or reflection content — the serialized
    // result mentions no student identifier.
    expect(JSON.stringify(result)).not.toContain("student-avery");
  });

  it("empty tenant: zero counts, null rates (no divide-by-zero)", async () => {
    mocks.getWorld.mockResolvedValue(
      stubWorld({ sessionsByReflection: {}, probesByStudent: {} }),
    );

    const result = await getPilotSignals();
    expect(result.activeStudents).toBe(0);
    expect(result.returnRateSecond).toBeNull();
    expect(result.returnRateThird).toBeNull();
    expect(result.probeCompletionRate).toBeNull();
    expect(result.improvingShare).toBeNull();
  });
});
