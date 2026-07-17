import { describe, expect, it } from "vitest";

import {
  REQUIRED_IN_PRODUCTION,
  assertProductionConfig,
  isProduction,
  missingProductionConfig,
} from "@/app/_world/productionConfig";

const FULL: Record<string, string | undefined> = {
  VERCEL_ENV: "production",
  SESSION_SECRET: "x".repeat(32),
  DATABASE_URL: "postgres://user:pw@host:6543/db",
  CRISIS_KEY_HEX: "a".repeat(64),
  REFLECTION_KEY_HEX: "b".repeat(64),
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "no-reply@school.test",
  OPERATOR_EMAIL: "operator@school.test",
  CRON_SECRET: "s".repeat(24),
};

describe("production config assertion", () => {
  it("passes when every required var is set in production", () => {
    expect(missingProductionConfig(FULL)).toEqual([]);
    expect(() => assertProductionConfig(FULL)).not.toThrow();
  });

  it("refuses to start in production when ANY single required var is missing", () => {
    for (const key of REQUIRED_IN_PRODUCTION) {
      const env = { ...FULL };
      delete env[key];
      expect(missingProductionConfig(env)).toContain(key);
      expect(() => assertProductionConfig(env)).toThrow(new RegExp(key));
    }
  });

  it("refuses the all-zero dev crisis key in production", () => {
    expect(() =>
      assertProductionConfig({ ...FULL, CRISIS_KEY_HEX: "0".repeat(64) }),
    ).toThrow(/all-zero/i);
  });

  it("is a no-op in dev/test even with nothing set", () => {
    expect(isProduction()).toBe(false); // vitest runs as NODE_ENV=test
    expect(() => assertProductionConfig({ NODE_ENV: "test" })).not.toThrow();
    expect(() => assertProductionConfig({})).not.toThrow();
  });

  it("never fails the production BUILD (only a running server)", () => {
    expect(() =>
      assertProductionConfig({
        VERCEL_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      }),
    ).not.toThrow();
  });
});
