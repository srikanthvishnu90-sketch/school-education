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
