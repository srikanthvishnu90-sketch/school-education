import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeToken: vi.fn(),
  lookupByEmail: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("@/app/_world/authCore", () => ({
  consumeToken: mocks.consumeToken,
  devLinksVisible: vi.fn(() => false),
  getEmailSender: vi.fn(() => ({ send: vi.fn() })),
  lookupByEmail: mocks.lookupByEmail,
  mintToken: vi.fn(() => "token"),
  pilotGateAccepts: vi.fn(() => true),
}));

vi.mock("@/app/_world/session", () => ({
  signIn: mocks.signIn,
}));

import { verifyMagicLink } from "@/app/_world/authActions";

describe("magic-link role landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeToken.mockReturnValue("avery@demo.school");
    mocks.lookupByEmail.mockReturnValue({
      id: "student-avery",
      role: "student",
      email: "avery@demo.school",
    });
    mocks.signIn.mockResolvedValue(undefined);
  });

  it("lands a verified student on their courses", async () => {
    await expect(verifyMagicLink("valid-token")).resolves.toEqual({
      ok: true,
      redirect: "/courses",
    });
    expect(mocks.signIn).toHaveBeenCalledWith("student-avery");
  });
});
