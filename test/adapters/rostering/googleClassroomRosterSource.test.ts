import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createGoogleClassroomRosterSource,
  GOOGLE_CLASSROOM_SCOPE,
} from "@/adapters/rostering/googleClassroomRosterSource";

const ENV_KEYS = [
  "GOOGLE_CLASSROOM_CLIENT_ID",
  "GOOGLE_CLASSROOM_CLIENT_SECRET",
  "GOOGLE_CLASSROOM_REFRESH_TOKEN",
] as const;

/** Save and clear the three credential vars, restoring exactly after each test. */
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
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

describe("google classroom roster source", () => {
  it("has kind 'google_classroom'", () => {
    expect(createGoogleClassroomRosterSource().kind).toBe("google_classroom");
  });

  it("isConfigured() is false when the credential env is unset", () => {
    expect(createGoogleClassroomRosterSource().isConfigured()).toBe(false);
  });

  it("importRoster fails closed with a precise, credential-naming error when unconfigured", async () => {
    const source = createGoogleClassroomRosterSource();
    await expect(source.importRoster("course-1")).rejects.toThrow(
      /not configured/i,
    );
    // The error must name every missing var and the read-only scope.
    await expect(source.importRoster("course-1")).rejects.toThrow(
      /GOOGLE_CLASSROOM_CLIENT_ID.*GOOGLE_CLASSROOM_CLIENT_SECRET.*GOOGLE_CLASSROOM_REFRESH_TOKEN/,
    );
    await expect(source.importRoster("course-1")).rejects.toThrow(
      GOOGLE_CLASSROOM_SCOPE,
    );
  });

  it("names only the missing vars when some credentials are present", async () => {
    process.env.GOOGLE_CLASSROOM_CLIENT_ID = "id";
    const source = createGoogleClassroomRosterSource();
    expect(source.isConfigured()).toBe(false);
    await expect(source.importRoster("course-1")).rejects.toThrow(
      /GOOGLE_CLASSROOM_CLIENT_SECRET, GOOGLE_CLASSROOM_REFRESH_TOKEN/,
    );
  });

  it("is 'configured' with all three vars but still fails closed as NOT_IMPLEMENTED (no fake data)", async () => {
    process.env.GOOGLE_CLASSROOM_CLIENT_ID = "id";
    process.env.GOOGLE_CLASSROOM_CLIENT_SECRET = "secret";
    process.env.GOOGLE_CLASSROOM_REFRESH_TOKEN = "token";
    const source = createGoogleClassroomRosterSource();
    expect(source.isConfigured()).toBe(true);
    await expect(source.importRoster("course-1")).rejects.toThrow(/NOT_IMPLEMENTED/);
  });

  it("accepts an explicit config object without reading env", async () => {
    const source = createGoogleClassroomRosterSource({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "token",
    });
    expect(source.isConfigured()).toBe(true);
    await expect(source.importRoster("course-1")).rejects.toThrow(/NOT_IMPLEMENTED/);
  });
});
