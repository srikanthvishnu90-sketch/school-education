import { describe, expect, it } from "vitest";

import { createLesson } from "@/domain/intelligence/lesson";
import {
  createReflectionMessage,
  createReflectionSession,
} from "@/domain/intelligence/session";
import { createReflectionPerformance } from "@/domain/intelligence/metacognition";
import {
  createCalibrationRecord,
  createEvidence,
  createSkillTag,
} from "@/domain/intelligence/calibrationModel";
import {
  createMemoryCalibrationRecordRepository,
  createMemoryEvidenceRepository,
  createMemoryLessonRepository,
  createMemoryPerformanceRepository,
  createMemoryQuestionSetRepository,
  createMemoryReflectionSessionRepository,
  createMemorySkillTagRepository,
} from "@/adapters/memory/intelligenceRepositories";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";

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

  it("deletes a lesson and its question set (teacher delete)", async () => {
    const lessons = createMemoryLessonRepository();
    const questionSets = createMemoryQuestionSetRepository();
    const det = createDeterministicReflectionIntelligence({ now: () => NOW });
    const lesson = createLesson({
      id: "L9",
      tenantId: "t",
      classId: "C",
      teacherId: "T",
      title: "Slope from a table",
      date: NOW,
      lessonType: "independent_practice",
      content: "Students found slope from five tables on their own.",
      objectives: [],
      standards: [],
      createdAt: NOW,
    });
    await lessons.save(lesson);
    const analysis = await det.analyzeLesson({ lesson });
    const set = await det.generateReflectionQuestions({
      analysis,
      depth: "standard",
      adaptiveFollowups: false,
    });
    await questionSets.save(set);

    expect(await lessons.findById("L9")).not.toBeNull();
    expect(await questionSets.findByLesson("L9")).not.toBeNull();

    await lessons.delete("L9");
    await questionSets.deleteByLesson("L9");

    expect(await lessons.findById("L9")).toBeNull();
    expect(await lessons.listByClass("C")).toHaveLength(0);
    expect(await questionSets.findByLesson("L9")).toBeNull();
    // Idempotent.
    await lessons.delete("L9");
    await questionSets.deleteByLesson("L9");
  });
});

describe("in-memory calibration repositories", () => {
  it("stores skill tags, finds by id, and lists scoped by class", async () => {
    const repo = createMemorySkillTagRepository();
    await repo.save(
      createSkillTag({ id: "sk1", classId: "C", label: "Factoring", source: "ai_extracted" }),
    );
    await repo.save(
      createSkillTag({ id: "sk2", classId: "C", label: "Slope", source: "teacher_edited" }),
    );
    await repo.save(
      createSkillTag({ id: "sk3", classId: "other", label: "Photosynthesis", source: "ai_extracted" }),
    );

    expect(await repo.findById("sk1")).not.toBeNull();
    expect(await repo.findById("missing")).toBeNull();
    // Scoped to class, insertion-ordered.
    expect((await repo.listByClass("C")).map((s) => s.id)).toEqual(["sk1", "sk2"]);
    expect((await repo.listByClass("other")).map((s) => s.id)).toEqual(["sk3"]);

    // Overwrite by id (teacher corrects the AI-drafted label).
    await repo.save(
      createSkillTag({ id: "sk1", classId: "C", label: "Factoring quadratics", source: "teacher_edited" }),
    );
    expect((await repo.findById("sk1"))?.label).toBe("Factoring quadratics");
    expect(await repo.listByClass("C")).toHaveLength(2); // overwritten, not appended
  });

  it("stores evidence and lists it by student and by student+lesson", async () => {
    const repo = createMemoryEvidenceRepository();
    const mk = (id: string, studentId: string, lessonId: string) =>
      createEvidence({ id, studentId, lessonId, skillId: "sk1", kind: "score", value: 4, maxValue: 6 });
    await repo.save(mk("e1", "stu", "L1"));
    await repo.save(mk("e2", "stu", "L1"));
    await repo.save(mk("e3", "stu", "L2"));
    await repo.save(mk("e4", "other", "L1"));

    expect((await repo.listByStudent("stu")).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect((await repo.listByStudentAndLesson("stu", "L1")).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(await repo.listByStudentAndLesson("stu", "none")).toEqual([]);

    // Overwrite by id.
    await repo.save(
      createEvidence({ id: "e1", studentId: "stu", lessonId: "L1", skillId: "sk1", kind: "exit_answer", value: "x = 3" }),
    );
    expect(await repo.listByStudent("stu")).toHaveLength(3); // overwritten, not appended
    expect((await repo.listByStudentAndLesson("stu", "L1"))[0]?.value).toBe("x = 3");
  });

  it("stores calibration records and lists by student and by student+skill", async () => {
    const repo = createMemoryCalibrationRecordRepository();
    const mk = (id: string, studentId: string, skillId: string, demonstrated: number | null) =>
      createCalibrationRecord({
        id,
        studentId,
        skillId,
        lessonId: "L1",
        claimedConfidence: 0.9,
        demonstrated,
        delta: demonstrated === null ? null : 0.9 - demonstrated,
        computedAt: NOW,
      });
    await repo.save(mk("c1", "stu", "sk1", 0.6));
    await repo.save(mk("c2", "stu", "sk2", null));
    await repo.save(mk("c3", "other", "sk1", 0.5));

    expect((await repo.listByStudent("stu")).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect((await repo.listByStudentAndSkill("stu", "sk1")).map((c) => c.id)).toEqual(["c1"]);
    expect(await repo.listByStudentAndSkill("stu", "none")).toEqual([]);
    // Dates round-trip as Date instances.
    expect((await repo.listByStudent("stu"))[0]?.computedAt).toBeInstanceOf(Date);

    // Overwrite by id (a grade arrives; the ungraded record is replaced).
    await repo.save(mk("c2", "stu", "sk2", 0.8));
    expect(await repo.listByStudent("stu")).toHaveLength(2); // overwritten, not appended
    expect((await repo.listByStudentAndSkill("stu", "sk2"))[0]?.delta).toBeCloseTo(0.1);
  });
});
