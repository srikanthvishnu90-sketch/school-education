import { describe, expect, it } from "vitest";

import { createLesson } from "@/domain/intelligence/lesson";
import {
  createReflectionMessage,
  createReflectionSession,
} from "@/domain/intelligence/session";
import {
  createMemoryLessonRepository,
  createMemoryReflectionSessionRepository,
} from "@/adapters/memory/intelligenceRepositories";

const NOW = new Date("2026-07-01T00:00:00Z");

describe("in-memory intelligence repositories", () => {
  it("stores and lists lessons by class", async () => {
    const repo = createMemoryLessonRepository();
    await repo.save(
      createLesson({
        id: "L1",
        classId: "C",
        teacherId: "T",
        title: "Slope",
        date: NOW,
        lessonType: "direct_instruction",
        content: "x",
        objectives: [],
        standards: [],
        createdAt: NOW,
      }),
    );
    expect((await repo.listByClass("C")).map((l) => l.id)).toEqual(["L1"]);
    expect(await repo.findById("L1")).not.toBeNull();
    expect(await repo.listByClass("other")).toEqual([]);
  });

  it("finds a session by reflection + student and overwrites on save", async () => {
    const repo = createMemoryReflectionSessionRepository();
    const base = createReflectionSession({
      id: "S",
      reflectionId: "L1",
      studentId: "stu",
      status: "active",
      startedAt: NOW,
      messages: [],
    });
    await repo.save(base);
    await repo.save({
      ...base,
      messages: [
        createReflectionMessage({ id: "m", sessionId: "S", sender: "student", text: "hi", createdAt: NOW }),
      ],
    });
    const found = await repo.findByReflectionAndStudent("L1", "stu");
    expect(found?.messages).toHaveLength(1); // overwritten, not duplicated
    expect(await repo.listByReflection("L1")).toHaveLength(1);
  });
});
