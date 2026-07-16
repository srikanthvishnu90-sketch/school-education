import { describe, expect, it } from "vitest";

import {
  auditForStudent,
  listAudit,
  recordAudit,
} from "@/app/_world/auditLog";

const AT = new Date("2026-07-16T12:00:00.000Z");

describe("access audit log", () => {
  it("records who accessed which student's data, scoped by tenant, newest-first", () => {
    recordAudit({
      tenantId: "district-demo",
      actorId: "teacher-1",
      actorRole: "teacher",
      action: "view_class_brief",
      reflectionId: "lesson-x",
      studentId: "student-zeta",
      at: AT,
    });
    recordAudit({
      tenantId: "district-demo",
      actorId: "counselor-1",
      actorRole: "counselor",
      action: "view_escalation",
      studentId: "student-zeta",
      at: new Date(AT.getTime() + 1000),
    });
    // A different district's event must not appear in district-demo's log.
    recordAudit({
      tenantId: "district-north",
      actorId: "teacher-north",
      actorRole: "teacher",
      action: "view_lesson",
      reflectionId: "lesson-north",
      at: AT,
    });

    const demoLog = listAudit("district-demo");
    expect(demoLog.some((e) => e.reflectionId === "lesson-x")).toBe(true);
    expect(demoLog.every((e) => e.tenantId === "district-demo")).toBe(true);
    expect(listAudit("district-north").some((e) => e.reflectionId === "lesson-north")).toBe(
      true,
    );

    const forStudent = auditForStudent("student-zeta");
    expect(forStudent[0].action).toBe("view_escalation"); // newest first
    expect(forStudent.every((e) => e.studentId === "student-zeta")).toBe(true);
  });
});
