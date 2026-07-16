import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "@/app/_world/sessionToken";

/**
 * The session cookie is HMAC-signed, so a browser can't forge a session by
 * setting the cookie to a known id. These assertions guard that boundary.
 */
describe("signed session tokens", () => {
  it("round-trips a signed id", () => {
    const token = signSession("teacher-1");
    expect(token).not.toBe("teacher-1");
    expect(token.startsWith("teacher-1.")).toBe(true);
    expect(verifySession(token)).toBe("teacher-1");
  });

  it("rejects a raw, unsigned id (the old forgeable cookie)", () => {
    expect(verifySession("teacher-1")).toBeNull();
    expect(verifySession("counselor-1")).toBeNull();
  });

  it("rejects a tampered id with a valid-looking signature", () => {
    const token = signSession("student-avery");
    const forged = token.replace("student-avery", "teacher-1");
    expect(verifySession(forged)).toBeNull();
  });

  it("rejects a garbage or empty token", () => {
    expect(verifySession("")).toBeNull();
    expect(verifySession("nope")).toBeNull();
    expect(verifySession("teacher-1.")).toBeNull();
    expect(verifySession(".sig")).toBeNull();
  });
});
