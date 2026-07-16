import { describe, expect, it } from "vitest";

import {
  DEMO_PASSWORD,
  createStudentAccount,
  emailTaken,
  roleForId,
  verifyCredentials,
} from "@/app/_world/credentials";

/**
 * With no DATABASE_URL set (the test env), the credential store is the in-memory
 * adapter seeded with the demo accounts. These assertions hold for BOTH adapters
 * — the Postgres one runs the same pure hashing + the same seed set.
 */

describe("credential store — seeded demo accounts", () => {
  it("accepts the right password and reports the account's role", async () => {
    const account = await verifyCredentials("rivera@demo.school", DEMO_PASSWORD);
    expect(account).not.toBeNull();
    expect(account?.role).toBe("teacher");
    expect(account?.id).toBe("teacher-1");
  });

  it("is case-insensitive on the email", async () => {
    expect(await verifyCredentials("AVERY@Demo.School", DEMO_PASSWORD)).not.toBeNull();
  });

  it("rejects a wrong password", async () => {
    expect(await verifyCredentials("avery@demo.school", "not-it")).toBeNull();
  });

  it("rejects an unknown email", async () => {
    expect(await verifyCredentials("nobody@demo.school", DEMO_PASSWORD)).toBeNull();
  });

  it("never stores the password in plaintext", async () => {
    const account = await verifyCredentials("avery@demo.school", DEMO_PASSWORD);
    expect(account?.hash).not.toContain(DEMO_PASSWORD);
    expect(account?.salt.length).toBeGreaterThan(0);
  });

  it("resolves role from an id (the session's authority)", async () => {
    expect(await roleForId("teacher-1")).toBe("teacher");
    expect(await roleForId("student-avery")).toBe("student");
    expect(await roleForId("counselor-1")).toBe("counselor");
    expect(await roleForId("nobody")).toBeNull();
  });
});

describe("credential store — student sign-up", () => {
  it("creates a verifiable student account and rejects a duplicate email", async () => {
    const email = "signup-test@school.org";
    const id = await createStudentAccount(email, "sunflower22");
    expect(id.startsWith("student-")).toBe(true);
    expect(await roleForId(id)).toBe("student");
    expect(await emailTaken(email)).toBe(true);

    const back = await verifyCredentials(email, "sunflower22");
    expect(back?.id).toBe(id);
    expect(await verifyCredentials(email, "wrong")).toBeNull();

    await expect(createStudentAccount(email, "another")).rejects.toThrow();
  });
});
