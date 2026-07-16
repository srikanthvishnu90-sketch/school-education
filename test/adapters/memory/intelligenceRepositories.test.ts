import { describe, expect, it } from "vitest";

import { createLesson } from "@/domain/intelligence/lesson";
import {
  createReflectionMessage,
  createReflectionSession,
} from "@/domain/intelligence/session";
import { createReflectionPerformance } from "@/domain/intelligence/metacognition";
import {
  createMemoryLessonRepository,
  createMemoryPerformanceRepository,
  createMemoryReflectionSessionRepository,
} from "@/adapters/memory/intelligenceRepositories";

const NOW = new Date("2026-07-01T00:00:00Z");

describe("in-memory intelligence repositories", () => {
  it("stores and lists lessons by class", async () => {
    const repo = createMemoryLessonRepository();
    await repo.save(
      createLesson({
        id: "L1",
        tenantId: "t",
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

  it("stores a performance per (reflection, student) and overwrites on re-save", async () => {
    const repo = createMemoryPerformanceRepository();
    await repo.save(
      createReflectionPerformance({
        reflectionId: "L1",
        studentId: "stu",
        score: 0.4,
        recordedAt: NOW,
      }),
    );
    await repo.save(
      createReflectionPerformance({
        reflectionId: "L1",
        studentId: "stu",
        score: 0.8, // revised grade overwrites, not appends
        recordedAt: NOW,
      }),
    );
    expect((await repo.findByReflectionAndStudent("L1", "stu"))?.score).toBe(0.8);
    expect(await repo.listByStudent("stu")).toHaveLength(1);
    expect(await repo.findByReflectionAndStudent("L1", "other")).toBeNull();
  });

  it("deletes a student's data (right-to-erasure) without touching others", async () => {
    const sessions = createMemoryReflectionSessionRepository();
    const perfs = createMemoryPerformanceRepository();
    const mk = (studentId: string) =>
      createReflectionSession({
        id: `s:${studentId}`,
        reflectionId: "L1",
        studentId,
        status: "completed",
        startedAt: NOW,
        messages: [],
      });
    await sessions.save(mk("stu"));
    await sessions.save(mk("other"));
    await perfs.save(
      createReflectionPerformance({ reflectionId: "L1", studentId: "stu", score: 0.5, recordedAt: NOW }),
    );

    expect(await sessions.deleteByStudent("stu")).toBe(1);
    expect(await perfs.deleteByStudent("stu")).toBe(1);
    // The erased student is gone; the other student is untouched.
    expect(await sessions.listByStudent("stu")).toHaveLength(0);
    expect(await sessions.listByStudent("other")).toHaveLength(1);
    expect(await perfs.listByStudent("stu")).toHaveLength(0);
    // Deleting again is a no-op (idempotent).
    expect(await sessions.deleteByStudent("stu")).toBe(0);
  });
});
