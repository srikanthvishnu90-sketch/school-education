import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  saveRoster: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

// Keep the rest of rosterNames real (parseRoster, getRoster), but observe saveRoster.
vi.mock("@/app/_world/rosterNames", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/_world/rosterNames")>(
      "@/app/_world/rosterNames",
    );
  return { ...actual, saveRoster: mocks.saveRoster };
});

import { importRosterFromGoogleClassroom } from "@/app/_world/teacherReflectionActions";

const TEACHER = { id: "teacher-1", role: "teacher", tenantId: "t1" };

const ENV_KEYS = [
  "GOOGLE_CLASSROOM_CLIENT_ID",
  "GOOGLE_CLASSROOM_CLIENT_SECRET",
  "GOOGLE_CLASSROOM_REFRESH_TOKEN",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  mocks.getSessionUser.mockReset();
  mocks.saveRoster.mockReset();
  mocks.getSessionUser.mockResolvedValue(TEACHER);
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("importRosterFromGoogleClassroom", () => {
  it("returns { ok: false, reason: 'not_configured' } when Google env is unset — no throw, no persist", async () => {
    const result = await importRosterFromGoogleClassroom("course-1");
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(mocks.saveRoster).not.toHaveBeenCalled();
  });

  it("refuses a non-teacher caller", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(importRosterFromGoogleClassroom("course-1")).rejects.toThrow(
      /teacher/i,
    );
  });
});
