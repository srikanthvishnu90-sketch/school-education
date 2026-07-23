import { beforeEach, describe, expect, it, vi } from "vitest";
import type { World } from "@/app/_world/world";
import { createConsentRecord, type ConsentRecord } from "@/domain";

/**
 * The tenant-scoped, admin-only consent register (brief C6). A district admin can
 * produce the roster of who currently holds permission to reflect and on what basis
 * (parent/guardian for under-13, self for 13+), so an under-13's parental consent is
 * auditable — but the export is:
 *
 *   - ADMIN-ONLY: every other role is refused BEFORE any data is read.
 *   - TENANT-SCOPED: an admin sees only their own district's students.
 *   - LIFECYCLE-ONLY: grantor + basis + date; never any reflection/emotional content.
 *   - EFFECTIVE-ONLY: a student whose consent was revoked drops out of the register.
 */

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getWorld: vi.fn(),
  tenantForId: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/app/_world/world", () => ({ getWorld: mocks.getWorld }));
vi.mock("@/app/_world/credentials", () => ({ tenantForId: mocks.tenantForId }));
vi.mock("@/app/_world/auditLog", () => ({ listAudit: () => [] }));

import { exportConsentRecords } from "@/app/_world/adminActions";

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

describe("exportConsentRecords — admin-only", () => {
  it.each(Object.keys(USERS))(
    "REFUSES %s before any consent data is read",
    async (roleKey) => {
      mocks.getSessionUser.mockResolvedValue(USERS[roleKey]);
      await expect(exportConsentRecords()).rejects.toThrow(
        "Only a district admin can view this.",
      );
      // The gate is upstream of the data layer: a refused caller never opens the world.
      expect(mocks.getWorld).not.toHaveBeenCalled();
    },
  );
});

describe("exportConsentRecords — tenant-scoped register for an admin", () => {
  const NOW = new Date("2026-07-20T12:00:00.000Z");
  const LATER = new Date("2026-07-21T12:00:00.000Z");

  const record = (
    id: string,
    studentId: string,
    grantorType: "parent" | "self",
    status: "granted" | "revoked",
    at: Date,
  ): ConsentRecord =>
    createConsentRecord({
      id,
      studentId,
      grantorType,
      scopes: ["academic", "affect"],
      status,
      grantedAt: at,
      ...(status === "revoked" ? { revokedAt: at } : {}),
    });

  function stubWorld(records: ConsentRecord[]): World {
    return {
      repos: { consent: { listAll: vi.fn(async () => records) } },
    } as unknown as World;
  }

  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      tenantId: "district-demo",
    });
    // Tenant map: two students in the admin's district, one in another district.
    mocks.tenantForId.mockImplementation(async (id: string) => {
      if (id === "student-a") return "district-demo"; // under 13 (parent)
      if (id === "student-b") return "district-demo"; // 13+ (self)
      if (id === "student-outside") return "district-north"; // other tenant
      return null;
    });
  });

  it("returns only the admin's tenant, with the correct basis per student", async () => {
    mocks.getWorld.mockResolvedValue(
      stubWorld([
        record("c-a", "student-a", "parent", "granted", NOW),
        record("c-b", "student-b", "self", "granted", NOW),
        record("c-out", "student-outside", "parent", "granted", NOW),
      ]),
    );

    const result = await exportConsentRecords();

    expect(result.tenantId).toBe("district-demo");
    // student-outside is filtered out — tenant isolation.
    expect(result.records.map((r) => r.studentId)).toEqual([
      "student-a",
      "student-b",
    ]);

    const a = result.records.find((r) => r.studentId === "student-a");
    expect(a).toMatchObject({ under13: true, grantorType: "parent", grantedAt: NOW });

    const b = result.records.find((r) => r.studentId === "student-b");
    expect(b).toMatchObject({ under13: false, grantorType: "self" });
  });

  it("drops a student whose consent was later revoked (effective-only)", async () => {
    mocks.getWorld.mockResolvedValue(
      stubWorld([
        record("c-a1", "student-a", "parent", "granted", NOW),
        record("c-a2", "student-a", "parent", "revoked", LATER),
      ]),
    );

    const result = await exportConsentRecords();
    expect(result.records).toEqual([]);
  });

  it("exposes only lifecycle fields — never any reflection or emotional content", async () => {
    mocks.getWorld.mockResolvedValue(
      stubWorld([record("c-a", "student-a", "parent", "granted", NOW)]),
    );

    const result = await exportConsentRecords();
    expect(Object.keys(result.records[0] ?? {}).sort()).toEqual(
      ["grantedAt", "grantorType", "studentId", "under13"].sort(),
    );
  });
});
