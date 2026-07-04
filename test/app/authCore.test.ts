import { describe, expect, it } from "vitest";

import {
  consumeToken,
  isSeededEmail,
  lookupByEmail,
  mintToken,
  pilotGateAccepts,
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

  it("self-signs-up any plausible email as a student (stable, storage-free id)", () => {
    const user = lookupByEmail("new.student@school.org");
    expect(user?.role).toBe("student");
    // Deterministic: the same email always maps to the same account.
    expect(lookupByEmail("new.student@school.org")?.id).toBe(user?.id);
    // A self-served student is never one of the elevated fixed roles.
    expect(user?.id).not.toBe("teacher-1");
  });

  it("returns null for garbage that isn't an email", () => {
    expect(lookupByEmail("not-an-email")).toBeNull();
    expect(lookupByEmail("")).toBeNull();
  });
});

describe("closed-pilot access gate", () => {
  const CODE = "PILOT_ACCESS_CODE";

  it("is OPEN when no code is configured (dev/demo self-signup keeps working)", () => {
    delete process.env[CODE];
    expect(pilotGateAccepts("new.student@school.org", undefined)).toBe(true);
  });

  it("admits a self-served student only with the exact shared code", () => {
    process.env[CODE] = "spring-2026-alg";
    try {
      expect(pilotGateAccepts("new.student@school.org", "spring-2026-alg")).toBe(true);
      expect(pilotGateAccepts("new.student@school.org", "wrong")).toBe(false);
      expect(pilotGateAccepts("new.student@school.org", undefined)).toBe(false);
      // Surrounding whitespace on the entered code is tolerated.
      expect(pilotGateAccepts("new.student@school.org", "  spring-2026-alg ")).toBe(true);
    } finally {
      delete process.env[CODE];
    }
  });

  it("lets the seeded roster bypass the gate even when a code is required", () => {
    process.env[CODE] = "spring-2026-alg";
    try {
      expect(isSeededEmail("avery@demo.school")).toBe(true);
      expect(pilotGateAccepts("avery@demo.school", undefined)).toBe(true);
      expect(pilotGateAccepts("teacher@demo.school", undefined)).toBe(true);
    } finally {
      delete process.env[CODE];
    }
  });
});

describe("email transport", () => {
  it("Resend sender POSTs the absolute link with the API key", async () => {
    const { createResendSender } = await import("@/app/_world/authCore");
    let capturedUrl: unknown;
    let capturedInit: RequestInit | undefined;
    const fakeFetch = (async (url: unknown, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const sender = createResendSender("re_test_key", "plumb <no-reply@plumb.app>", fakeFetch);
    await sender.send("student@school.org", "/auth/verify?token=abc");

    expect(String(capturedUrl)).toBe("https://api.resend.com/emails");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.to).toBe("student@school.org");
    expect(body.html).toContain("/auth/verify?token=abc");
  });

  it("throws on a non-2xx response so the flow can surface a failure", async () => {
    const { createResendSender } = await import("@/app/_world/authCore");
    const failing = (async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;
    const sender = createResendSender("k", "from@x", failing);
    await expect(sender.send("to@y", "/auth/verify?token=t")).rejects.toThrow(/422/);
  });
});
