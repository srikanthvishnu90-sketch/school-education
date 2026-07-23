import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorldCore, type WorldCore } from "@/application";

/**
 * The under-13 parental-consent gate (brief C6 / COPPA). A reflection captures a
 * minor's emotional free-text, so before ANY of it can be collected the student
 * must hold a granted `affect` consent, and for an under-13 that consent must come
 * from a parent/guardian. This proves the gate is REAL and FAIL-CLOSED server-side:
 *
 *   - under 13 without a parent present  → refused, and NOTHING is recorded.
 *   - 13 or older                        → may self-consent.
 *   - under 13 WITH a parent present     → parental consent is recorded.
 *
 * The action runs against a real in-memory ConsentService + ConsentRepository (the
 * same composition the app uses), so "no consent was recorded" is observed through
 * the real store, not a stub that could hide a leak.
 */

const mocks = vi.hoisted(() => ({
  getSessionStudent: vi.fn(),
  getWorld: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionStudent: mocks.getSessionStudent,
}));
vi.mock("@/app/_world/world", () => ({ getWorld: mocks.getWorld }));

import {
  grantReflectionConsent,
  hasReflectionConsent,
} from "@/app/_world/consentActions";

const STUDENT_ID = "student-under13";

let core: WorldCore;

beforeEach(() => {
  vi.clearAllMocks();
  // A fresh real world core per test — real consent lifecycle, empty to start.
  core = buildWorldCore();
  mocks.getSessionStudent.mockResolvedValue(STUDENT_ID);
  mocks.getWorld.mockResolvedValue(core as unknown as Awaited<ReturnType<typeof mocks.getWorld>>);
});

describe("under-13 parental-consent gate is real and fail-closed", () => {
  it("REFUSES an under-13 student with no parent present, and records nothing", async () => {
    const result = await grantReflectionConsent(true, false);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/parent or guardian/i);

    // Fail-closed: the store holds NO consent, so the student cannot reflect.
    expect(await hasReflectionConsent()).toBe(false);
    expect(await core.repos.consent.listByStudent(STUDENT_ID)).toEqual([]);
  });

  it("ALLOWS an under-13 student once a parent/guardian gives permission", async () => {
    const result = await grantReflectionConsent(true, true);

    expect(result.ok).toBe(true);
    expect(await hasReflectionConsent()).toBe(true);
    // The recorded consent is a PARENT grant (the COPPA basis), not self.
    const records = await core.repos.consent.listByStudent(STUDENT_ID);
    expect(records).toHaveLength(1);
    expect(records[0]?.grantorType).toBe("parent");
  });

  it("ALLOWS a 13-or-older student to self-consent", async () => {
    const result = await grantReflectionConsent(false, false);

    expect(result.ok).toBe(true);
    expect(await hasReflectionConsent()).toBe(true);
    const records = await core.repos.consent.listByStudent(STUDENT_ID);
    expect(records[0]?.grantorType).toBe("self");
  });

  it("REFUSES when there is no signed-in student, and records nothing", async () => {
    mocks.getSessionStudent.mockResolvedValue(null);

    const result = await grantReflectionConsent(false, false);

    expect(result.ok).toBe(false);
    expect(await hasReflectionConsent()).toBe(false);
  });
});
