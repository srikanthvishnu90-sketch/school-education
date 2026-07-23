import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rosterSourceFor } from "@/adapters/rostering";

const ENV_KEYS = [
  "GOOGLE_CLASSROOM_CLIENT_ID",
  "GOOGLE_CLASSROOM_CLIENT_SECRET",
  "GOOGLE_CLASSROOM_REFRESH_TOKEN",
] as const;

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

describe("rosterSourceFor", () => {
  it("defaults to the manual source when the Google env is unset", () => {
    const source = rosterSourceFor({ rosterText: "Ada Lovelace" });
    expect(source.kind).toBe("manual");
    expect(source.isConfigured()).toBe(true);
  });

  it("selects the Google source when all three credentials are present", () => {
    process.env.GOOGLE_CLASSROOM_CLIENT_ID = "id";
    process.env.GOOGLE_CLASSROOM_CLIENT_SECRET = "secret";
    process.env.GOOGLE_CLASSROOM_REFRESH_TOKEN = "token";
    const source = rosterSourceFor({ rosterText: "Ada Lovelace" });
    expect(source.kind).toBe("google_classroom");
  });

  it("stays manual when the Google env is only partly set", () => {
    process.env.GOOGLE_CLASSROOM_CLIENT_ID = "id";
    const source = rosterSourceFor({ rosterText: "Ada Lovelace" });
    expect(source.kind).toBe("manual");
  });
});
