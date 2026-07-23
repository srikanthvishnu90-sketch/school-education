import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  listStudentReflections: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("@/app/_world/session", () => ({
  getSessionUser: mocks.getSessionUser,
  // The page now renders the student app shell (Sidebar), whose sign-out form
  // references this server action; a no-op stand-in keeps the render pure.
  signOutAction: mocks.signOutAction,
}));

vi.mock("@/app/_world/studentReflectionActions", () => ({
  listStudentReflections: mocks.listStudentReflections,
}));

import ReflectionsPage from "@/app/reflections/page";

describe("student reflections page", () => {
  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({
      id: "student-avery",
      role: "student",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("links a teacher-created lesson to its matching chat", async () => {
    mocks.listStudentReflections.mockResolvedValue([
      {
        reflectionId: "lesson-from-teacher",
        title: "Comparing linear models",
        lessonType: "group_work",
        createdAt: "2026-07-11T15:00:00.000Z",
        status: "not_started",
      },
    ]);

    render(await ReflectionsPage());

    expect(
      screen.getByRole("link", {
        name: "Start: Comparing linear models. Status: Ready",
      }),
    ).toHaveAttribute("href", "/chat/lesson-from-teacher");
    expect(screen.getByText("Group work")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("explains when the teacher has not published a reflection yet", async () => {
    mocks.listStudentReflections.mockResolvedValue([]);

    render(await ReflectionsPage());

    expect(
      screen.getByRole("heading", { name: "No lessons are ready yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/when your teacher posts a lesson/i),
    ).toBeInTheDocument();
  });

  it("does not offer a broken restart link for a closed reflection", async () => {
    mocks.listStudentReflections.mockResolvedValue([
      {
        reflectionId: "lesson-closed",
        title: "Closed lesson",
        lessonType: "review",
        createdAt: "2026-07-10T15:00:00.000Z",
        status: "abandoned",
      },
    ]);

    render(await ReflectionsPage());

    expect(screen.queryByRole("link", { name: /closed lesson/i })).toBeNull();
    expect(
      screen.getByLabelText("Closed lesson. Status: Closed. Unavailable"),
    ).toBeInTheDocument();
  });
});
