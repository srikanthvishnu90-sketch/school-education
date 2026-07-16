import { describe, expect, it } from "vitest";

import {
  auditForStudent,
  listAudit,
  recordAudit,
} from "@/app/_world/auditLog";

const AT = new Date("2026-07-16T12:00:00.000Z");

describe("access audit log", () => {
  it("records who accessed which student's data and lists it newest-first", () => {
    recordAudit({
      actorId: "teacher-1",
      actorRole: "teacher",
      action: "view_class_brief",
      reflectionId: "lesson-x",
      studentId: "student-zeta",
      at: AT,
    });
    recordAudit({
      actorId: "counselor-1",
      actorRole: "counselor",
      action: "view_escalation",
      studentId: "student-zeta",
      at: new Date(AT.getTime() + 1000),
    });

    const forStudent = auditForStudent("student-zeta");
    expect(forStudent.length).toBeGreaterThanOrEqual(2);
    // Newest first.
    expect(forStudent[0].action).toBe("view_escalation");
    expect(forStudent[0].actorRole).toBe("counselor");
    expect(forStudent.every((e) => e.studentId === "student-zeta")).toBe(true);

    // The global feed carries the events too.
    expect(listAudit().some((e) => e.reflectionId === "lesson-x")).toBe(true);
  });
});
