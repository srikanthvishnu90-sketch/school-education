import { describe, expect, it } from "vitest";

import {
  consumeToken,
  lookupByEmail,
  mintToken,
} from "@/app/_world/authCore";

/**
 * Magic-link mechanics: tokens are single-use and expiring, the directory maps
 * provisioned emails to roles, and unknown emails simply aren't found (the action
 * layer turns that into a non-leaking "sent").
 */
describe("magic-link tokens", () => {
  it("consumes a valid token exactly once", () => {
    const now = 1_000_000;
    const token = mintToken("avery@demo.school", now);
    expect(consumeToken(token, now + 1000)).toBe("avery@demo.school");
    // Single use — a second consume fails.
    expect(consumeToken(token, now + 1000)).toBeNull();
  });

  it("rejects an expired token (and burns it)", () => {
    const now = 2_000_000;
    const token = mintToken("blake@demo.school", now);
    const later = now + 16 * 60 * 1000; // past the 15-minute TTL
    expect(consumeToken(token, later)).toBeNull();
  });

  it("rejects an unknown token", () => {
    expect(consumeToken("not-a-real-token")).toBeNull();
  });
});

describe("directory", () => {
  it("maps provisioned emails (case-insensitive) to roles", () => {
    expect(lookupByEmail("AVERY@demo.school")?.role).toBe("student");
    expect(lookupByEmail("teacher@demo.school")?.role).toBe("teacher");
    expect(lookupByEmail("counselor@demo.school")?.role).toBe("counselor");
  });

  it("does not find an unprovisioned email", () => {
    expect(lookupByEmail("stranger@example.com")).toBeNull();
  });
});
