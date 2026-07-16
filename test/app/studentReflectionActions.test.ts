import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getWorld: vi.fn(),
  listByClass: vi.fn(),
  listByStudent: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/app/_world/world", () => ({
  getWorld: mocks.getWorld,
}));

import { listStudentReflections } from "@/app/_world/studentReflectionActions";

describe("student reflection discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({
      id: "student-avery",
      role: "student",
    });
    mocks.getWorld.mockResolvedValue({
      students: [{ id: "student-avery" }],
      intel: {
        lessons: { listByClass: mocks.listByClass },
        sessions: { listByStudent: mocks.listByStudent },
      },
    });
  });

  it("lists class lessons newest first with only the signed-in student's status", async () => {
    mocks.listByClass.mockResolvedValue([
      {
        id: "lesson-older",
        title: "Older lesson",
        lessonType: "discussion",
        createdAt: new Date("2026-07-09T15:00:00.000Z"),
      },
      {
        id: "lesson-newer",
        title: "Newer lesson",
        lessonType: "group_work",
        createdAt: new Date("2026-07-11T15:00:00.000Z"),
      },
    ]);
    mocks.listByStudent.mockResolvedValue([
      {
        reflectionId: "lesson-newer",
        studentId: "student-avery",
        status: "active",
      },
    ]);

    await expect(listStudentReflections()).resolves.toEqual([
      {
        reflectionId: "lesson-newer",
        title: "Newer lesson",
        lessonType: "group_work",
        createdAt: "2026-07-11T15:00:00.000Z",
        status: "active",
      },
      {
        reflectionId: "lesson-older",
        title: "Older lesson",
        lessonType: "discussion",
        createdAt: "2026-07-09T15:00:00.000Z",
        status: "not_started",
      },
    ]);
    expect(mocks.listByClass).toHaveBeenCalledWith("class-1");
    expect(mocks.listByStudent).toHaveBeenCalledWith("student-avery");
  });

  it("refuses unauthenticated and non-student callers", async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: "teacher-1",
      role: "teacher",
    });

    await expect(listStudentReflections()).rejects.toThrow(
      "Only a student can view these reflections.",
    );
    expect(mocks.getWorld).not.toHaveBeenCalled();
  });

  it("does not expose a class feed to a self-signup who is not on the roster", async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: "student-unrostered",
      role: "student",
    });

    await expect(listStudentReflections()).resolves.toEqual([]);
    expect(mocks.listByClass).not.toHaveBeenCalled();
    expect(mocks.listByStudent).not.toHaveBeenCalled();
  });
});
